import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthResponseDto } from './dto/auth-response.dto.js';
import type { User } from '../../generated/prisma/client.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Authenticate a user by email/phone and password, returning tokens and user info.
   */
  async login(identifier: string, password: string): Promise<AuthResponseDto> {
    const user = await this.validateUser(identifier, password);

    // Load role reference for JWT
    const userWithRole = await this.prisma.user.findUnique({
      where: { id: user.id },
      include: { roleRef: { select: { id: true, slug: true } } },
    });

    const tokens = await this.generateTokens({
      ...user,
      roleId: userWithRole?.roleRef?.id,
      roleSlug: userWithRole?.roleRef?.slug,
    });

    // Store the hashed refresh token on the user record
    const hashedRefreshToken = await this.hashPassword(tokens.refreshToken);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: hashedRefreshToken },
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

    // Generate new token pair
    const tokens = await this.generateTokens({
      ...user,
      roleId: userWithRole?.roleRef?.id,
      roleSlug: userWithRole?.roleRef?.slug,
    });

    // Update stored refresh token hash
    const hashedRefreshToken = await this.hashPassword(tokens.refreshToken);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: hashedRefreshToken },
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
   * Generate both access and refresh JWT tokens for a given user.
   */
  async generateTokens(
    user: Pick<User, 'id' | 'email' | 'role'> & {
      roleId?: string;
      roleSlug?: string;
    },
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      roleId: user.roleId,
      roleSlug: user.roleSlug,
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
