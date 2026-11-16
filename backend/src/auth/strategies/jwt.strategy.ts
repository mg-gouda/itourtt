import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Request } from 'express';
import {
  SessionsService,
  SINGLE_DEVICE_ROLES,
  isBackgroundRequest,
} from '../../sessions/sessions.service.js';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  roleId?: string;
  roleSlug?: string;
  sid?: string; // session ID — validated against DB on every request
  twoFactorPending?: boolean; // set ONLY on the pre-2FA challenge token
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
  ) {
    const secret = configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET is not defined in environment variables');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: JwtPayload) {
    // The pre-2FA challenge token is signed with the same secret but must NEVER
    // authenticate a request — it only authorizes /auth/2fa/verify.
    if (payload.twoFactorPending) {
      throw new UnauthorizedException('Two-factor verification required');
    }

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
    // A session the inactivity sweep ended reports that instead, so the portal can
    // say "logged out for inactivity" rather than "someone else signed in".
    const guardedRoles: readonly string[] = SINGLE_DEVICE_ROLES;
    if (guardedRoles.includes(user.role) && payload.sid !== user.sessionId) {
      const reason = payload.sid ? await this.sessions.endReasonOf(payload.sid) : null;
      throw new UnauthorizedException(
        reason === 'IDLE_TIMEOUT' ? 'SESSION_IDLE_TIMEOUT' : 'SESSION_DISPLACED',
      );
    }

    // Heartbeat: keep this device's session fresh (throttled). Background polls
    // refresh lastSeenAt only; real requests also count as user activity.
    // Fire-and-forget so it never adds latency or fails the request.
    if (payload.sid) {
      const activity = !isBackgroundRequest(
        req.method,
        req.originalUrl ?? req.url,
        req.headers as Record<string, unknown>,
      );
      void this.sessions.touch(payload.sid, activity).catch(() => undefined);
    }

    return {
      id: payload.sub,
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
      roleId: payload.roleId,
      roleSlug: payload.roleSlug,
      sid: payload.sid,
    };
  }
}
