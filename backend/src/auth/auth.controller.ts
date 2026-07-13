import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Ip,
  Headers,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import type { SessionContext } from '../sessions/sessions.service.js';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshDto } from './dto/refresh.dto.js';
import {
  RegisterDeviceTokenDto,
  RemoveDeviceTokenDto,
} from './dto/device-token.dto.js';
import type { AuthResponseDto } from './dto/auth-response.dto.js';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Get('login-config')
  async getLoginConfig() {
    const settings = await this.prisma.systemSettings.findFirst();
    return {
      loginBgImageUrl: settings?.loginBgImageUrl ?? null,
      loginLogoUrl: settings?.loginLogoUrl ?? null,
    };
  }

  // Brute-force protection: cap login attempts to 10/min per IP (tighter than
  // the global default) so credential-stuffing is impractical.
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: LoginDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-forwarded-for') forwardedFor?: string,
  ): Promise<AuthResponseDto | { twoFactorRequired: true; challengeToken: string }> {
    return this.authService.login(
      loginDto.identifier,
      loginDto.password,
      this.sessionCtx(ip, userAgent, forwardedFor),
    );
  }

  // Real client IP behind Traefik/nginx is the first X-Forwarded-For hop.
  private sessionCtx(ip: string, userAgent?: string, forwardedFor?: string): SessionContext {
    const realIp = forwardedFor?.split(',')[0]?.trim() || ip || null;
    return { ip: realIp, userAgent: userAgent ?? null };
  }

  // Login step 2: exchange the challenge + a TOTP/recovery code for a session.
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('2fa/verify')
  @HttpCode(HttpStatus.OK)
  async verifyTwoFactor(
    @Body() body: { challengeToken: string; code: string },
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-forwarded-for') forwardedFor?: string,
  ) {
    return this.authService.verifyTwoFactor(
      body.challengeToken,
      body.code,
      this.sessionCtx(ip, userAgent, forwardedFor),
    );
  }

  @Post('2fa/setup')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async setupTwoFactor(@CurrentUser('sub') userId: string) {
    return this.authService.setupTwoFactor(userId);
  }

  @Post('2fa/enable')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async enableTwoFactor(
    @CurrentUser('sub') userId: string,
    @Body() body: { code: string },
  ) {
    return this.authService.enableTwoFactor(userId, body.code);
  }

  @Post('2fa/disable')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async disableTwoFactor(
    @CurrentUser('sub') userId: string,
    @Body() body: { code: string },
  ) {
    await this.authService.disableTwoFactor(userId, body.code);
    return { message: 'Two-factor authentication disabled' };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() refreshDto: RefreshDto): Promise<AuthResponseDto> {
    return this.authService.refresh(refreshDto.refreshToken);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() body: { email: string }) {
    await this.authService.forgotPassword(body.email ?? '');
    return { message: 'If this email is registered, a reset link has been sent.' };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() body: { email: string; token: string; newPassword: string }) {
    await this.authService.resetPassword(body.email, body.token, body.newPassword);
    return { message: 'Password has been reset successfully. Please log in.' };
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(
    @CurrentUser('sub') userId: string,
    @CurrentUser('sid') sessionId?: string,
  ) {
    await this.authService.logout(userId, sessionId);
    return { message: 'Logged out successfully' };
  }

  @Post('device-token')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async registerDeviceToken(
    @CurrentUser('sub') userId: string,
    @Body() dto: RegisterDeviceTokenDto,
  ) {
    await this.prisma.deviceToken.upsert({
      where: {
        userId_token: { userId, token: dto.token },
      },
      create: {
        userId,
        token: dto.token,
        platform: dto.platform,
      },
      update: {
        platform: dto.platform,
      },
    });
    return { message: 'Device token registered' };
  }

  @Delete('device-token')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async removeDeviceToken(
    @CurrentUser('sub') userId: string,
    @Body() dto: RemoveDeviceTokenDto,
  ) {
    await this.prisma.deviceToken.deleteMany({
      where: { userId, token: dto.token },
    });
    return { message: 'Device token removed' };
  }
}
