import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  roleId?: string;
  roleSlug?: string;
  sid?: string; // session ID — validated against DB on every request
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const secret = configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET is not defined in environment variables');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: JwtPayload) {
    // Fetch the minimal user fields needed for session validation
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, isActive: true, deletedAt: true, sessionId: true, role: true },
    });

    if (!user || !user.isActive || user.deletedAt) {
      throw new UnauthorizedException('Account is inactive or deleted');
    }

    // For REP and DRIVER roles: validate sessionId on every request.
    // If it doesn't match the DB, the session was displaced by a new login.
    const guardedRoles = ['REP', 'DRIVER'];
    if (guardedRoles.includes(user.role) && payload.sid !== user.sessionId) {
      throw new UnauthorizedException('SESSION_DISPLACED');
    }

    return {
      id: payload.sub,
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
      roleId: payload.roleId,
      roleSlug: payload.roleSlug,
    };
  }
}
