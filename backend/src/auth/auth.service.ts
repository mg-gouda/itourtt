import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { EmailService } from '../email/email.service.js';
import type { AuthResponseDto } from './dto/auth-response.dto.js';
import type { User } from '../../generated/prisma/client.js';

const RESET_TOKEN_EXPIRY_MINUTES = 60;
// Session lifetime mirrors the refresh token window (7 days)
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Authenticate a user by email/phone and password, returning tokens and user info.
   *
   * For REP and DRIVER roles a concurrent-session guard applies when an active session
   * already exists on the account:
   *   - Default (CONCURRENT_LOGIN_LOCK unset/false): "last-device-wins" — the old session
   *     is displaced and the new login proceeds. A legitimate re-login (e.g. the app lost
   *     its session and the user simply signs in again) is NOT punished.
   *   - Opt-in lock (CONCURRENT_LOGIN_LOCK=true): the account password is scrambled and a
   *     423 Locked response is returned. The user must contact an administrator to have
   *     their password reset. Use this only when account-sharing must be hard-blocked.
   */
  async login(identifier: string, password: string): Promise<AuthResponseDto> {
    const user = await this.validateUser(identifier, password);

    // ── Concurrent-session guard (REP & DRIVER only) ─────────────────────────
    const guardedRoles = ['REP', 'DRIVER'];
    if (guardedRoles.includes(user.role)) {
      const now = new Date();
      const hasActiveSession =
        user.sessionId !== null &&
        user.sessionExpiresAt !== null &&
        user.sessionExpiresAt > now;

      if (hasActiveSession) {
        const lockOnConcurrent =
          this.configService.get<string>('CONCURRENT_LOGIN_LOCK') === 'true';

        if (lockOnConcurrent) {
          // Opt-in hard lock: scramble the password so the shared credentials can't be reused
          const scrambledHash = await this.hashPassword(
            crypto.randomBytes(32).toString('hex'),
          );
          await this.prisma.user.update({
            where: { id: user.id },
            data: {
              passwordHash: scrambledHash,
              sessionId: null,
              sessionExpiresAt: null,
              refreshToken: null,
            },
          });

          this.logger.warn(
            `Concurrent login detected for user ${user.id} (${user.role}). Account locked.`,
          );

          throw new HttpException(
            'Concurrent login detected. Your account has been locked. Please contact your administrator to restore access.',
            HttpStatus.LOCKED, // 423
          );
        }

        // Default: last-device-wins. The old session is displaced below when a new
        // sessionId is minted and stored; the previous device's token then fails the
        // per-request sid check (SESSION_DISPLACED) and is logged out cleanly.
        this.logger.log(
          `Concurrent login for user ${user.id} (${user.role}). Displacing previous session.`,
        );
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Load role reference for JWT
    const userWithRole = await this.prisma.user.findUnique({
      where: { id: user.id },
      include: { roleRef: { select: { id: true, slug: true } } },
    });

    // Generate a new session ID for this login
    const sessionId = crypto.randomUUID();
    const sessionExpiresAt = new Date(Date.now() + SESSION_TTL_MS);

    const tokens = await this.generateTokens({
      ...user,
      roleId: userWithRole?.roleRef?.id,
      roleSlug: userWithRole?.roleRef?.slug,
      sessionId,
    });

    // Store hashed refresh token + session tracking
    const hashedRefreshToken = await this.hashPassword(tokens.refreshToken);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        refreshToken: hashedRefreshToken,
        sessionId,
        sessionExpiresAt,
      },
    });

    // If user is a REP, resolve their repId
    let repId: string | undefined;
    if (user.role === 'REP') {
      const rep = await this.prisma.rep.findFirst({
        where: { userId: user.id, deletedAt: null },
        select: { id: true },
      });
      repId = rep?.id;
    }

    // If user is a DRIVER, resolve their driverId
    let driverId: string | undefined;
    if (user.role === 'DRIVER') {
      const driver = await this.prisma.driver.findFirst({
        where: { userId: user.id, deletedAt: null },
        select: { id: true },
      });
      driverId = driver?.id;
    }

    // If user is a SUPPLIER, resolve their supplierId
    let supplierId: string | undefined;
    if (user.role === 'SUPPLIER') {
      const supplier = await this.prisma.supplier.findFirst({
        where: { userId: user.id, deletedAt: null },
        select: { id: true },
      });
      supplierId = supplier?.id;
    }

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        roleId: userWithRole?.roleRef?.id,
        roleSlug: userWithRole?.roleRef?.slug,
        ...(repId && { repId }),
        ...(driverId && { driverId }),
        ...(supplierId && { supplierId }),
      },
    };
  }

  /**
   * Validate a refresh token and issue new access + refresh tokens.
   * Also extends the session expiry window.
   */
  async refresh(refreshToken: string): Promise<AuthResponseDto> {
    let payload: { sub: string; email: string; role: string };

    try {
      payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || !user.isActive || user.deletedAt) {
      throw new UnauthorizedException('User not found or inactive');
    }

    if (!user.refreshToken) {
      throw new ForbiddenException('Refresh token has been revoked');
    }

    // Compare the provided refresh token against the stored hash
    const isRefreshTokenValid = await this.comparePassword(
      refreshToken,
      user.refreshToken,
    );

    if (!isRefreshTokenValid) {
      throw new ForbiddenException('Refresh token does not match');
    }

    // Load role reference for JWT
    const userWithRole = await this.prisma.user.findUnique({
      where: { id: user.id },
      include: { roleRef: { select: { id: true, slug: true } } },
    });

    // Keep the same sessionId but extend its expiry
    const sessionId = user.sessionId ?? crypto.randomUUID();
    const sessionExpiresAt = new Date(Date.now() + SESSION_TTL_MS);

    // Generate new token pair
    const tokens = await this.generateTokens({
      ...user,
      roleId: userWithRole?.roleRef?.id,
      roleSlug: userWithRole?.roleRef?.slug,
      sessionId,
    });

    // Update stored refresh token hash + extend session
    const hashedRefreshToken = await this.hashPassword(tokens.refreshToken);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        refreshToken: hashedRefreshToken,
        sessionId,
        sessionExpiresAt,
      },
    });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        roleId: userWithRole?.roleRef?.id,
        roleSlug: userWithRole?.roleRef?.slug,
      },
    };
  }

  /**
   * Clear the session for the given user (called on explicit logout).
   * This allows them to log in again without triggering the concurrent-session lock.
   */
  async logout(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        sessionId: null,
        sessionExpiresAt: null,
        refreshToken: null,
      },
    });
  }

  /**
   * Find user by email or phone and verify password. Throws if invalid.
   */
  async validateUser(identifier: string, password: string): Promise<User> {
    // Try email first, then phone
    let user = await this.prisma.user.findUnique({
      where: { email: identifier },
    });

    if (!user) {
      user = await this.prisma.user.findUnique({
        where: { phone: identifier },
      });
    }

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive || user.deletedAt) {
      throw new UnauthorizedException('Account is disabled');
    }

    const isPasswordValid = await this.comparePassword(
      password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return user;
  }

  /**
   * Hash a plaintext string using bcrypt.
   */
  async hashPassword(plaintext: string): Promise<string> {
    const saltRounds = 12;
    return bcrypt.hash(plaintext, saltRounds);
  }

  /**
   * Compare a plaintext string against a bcrypt hash.
   */
  async comparePassword(plaintext: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plaintext, hash);
  }

  /**
   * Initiate password reset: generate a token and send it by email.
   * Always returns success to prevent user enumeration.
   */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive || user.deletedAt) {
      // Return silently — don't reveal whether the email exists
      return;
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiry = new Date(Date.now() + RESET_TOKEN_EXPIRY_MINUTES * 60 * 1000);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordResetToken: tokenHash, passwordResetExpiry: expiry },
    });

    const frontendUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000');
    const resetLink = `${frontendUrl}/reset-password?token=${rawToken}&email=${encodeURIComponent(email)}`;

    const html = `
      <h2>Password Reset Request</h2>
      <p>Hi ${user.name},</p>
      <p>You requested a password reset. Click the link below to set a new password. This link expires in ${RESET_TOKEN_EXPIRY_MINUTES} minutes.</p>
      <p><a href="${resetLink}" style="background:#2563eb;color:#fff;padding:10px 20px;text-decoration:none;border-radius:6px;display:inline-block;">Reset Password</a></p>
      <p>If you didn't request this, please ignore this email.</p>
      <p style="color:#888;font-size:12px;">iTourTT — Transport & Traffic Management</p>
    `;

    try {
      await (this.emailService as any).send(email, 'Password Reset — iTourTT', html);
    } catch (err) {
      this.logger.error(`Failed to send password reset email to ${email}: ${(err as Error).message}`);
    }
  }

  /**
   * Complete password reset: verify token, update password, invalidate token.
   * Also clears the session so the user must log in fresh.
   */
  async resetPassword(email: string, rawToken: string, newPassword: string): Promise<void> {
    if (!newPassword || newPassword.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordResetToken || !user.passwordResetExpiry) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    if (new Date() > user.passwordResetExpiry) {
      throw new BadRequestException('Reset token has expired');
    }

    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    if (tokenHash !== user.passwordResetToken) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const passwordHash = await this.hashPassword(newPassword);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordResetToken: null,
        passwordResetExpiry: null,
        refreshToken: null,
        sessionId: null,
        sessionExpiresAt: null,
      },
    });
  }

  /**
   * Generate both access and refresh JWT tokens for a given user.
   * The sessionId is embedded in the payload so every request can be validated against the DB.
   */
  async generateTokens(
    user: Pick<User, 'id' | 'email' | 'role'> & {
      roleId?: string;
      roleSlug?: string;
      sessionId?: string;
    },
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      roleId: user.roleId,
      roleSlug: user.roleSlug,
      sid: user.sessionId,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_SECRET'),
        expiresIn: this.configService.get<string>('JWT_EXPIRES_IN', '15m') as any,
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.get<string>(
          'JWT_REFRESH_EXPIRES_IN',
          '7d',
        ) as any,
      }),
    ]);

    return { accessToken, refreshToken };
  }
}
