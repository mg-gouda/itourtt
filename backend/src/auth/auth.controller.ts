import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshDto } from './dto/refresh.dto.js';
import {
  RegisterDeviceTokenDto,
  RemoveDeviceTokenDto,
} from './dto/device-token.dto.js';
import type { AuthResponseDto } from './dto/auth-response.dto.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('login-config')
  async getLoginConfig() {
    const settings = await this.prisma.systemSettings.findFirst();
    return {
      loginBgImageUrl: settings?.loginBgImageUrl ?? null,
      loginLogoUrl: settings?.loginLogoUrl ?? null,
    };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto): Promise<AuthResponseDto> {
    return this.authService.login(loginDto.identifier, loginDto.password);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() refreshDto: RefreshDto): Promise<AuthResponseDto> {
    return this.authService.refresh(refreshDto.refreshToken);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() body: { email: string }) {
    await this.authService.forgotPassword(body.email ?? '');
    return { message: 'If this email is registered, a reset link has been sent.' };
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() body: { email: string; token: string; newPassword: string }) {
    await this.authService.resetPassword(body.email, body.token, body.newPassword);
    return { message: 'Password has been reset successfully. Please log in.' };
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(@CurrentUser('sub') userId: string) {
    await this.authService.logout(userId);
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
