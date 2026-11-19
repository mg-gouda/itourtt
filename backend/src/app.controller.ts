import { Body, Controller, Get, Logger, Post, Req } from '@nestjs/common';
import { AppService } from './app.service.js';
import { Public } from './common/decorators/public.decorator.js';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  private readonly clientLog = new Logger('ClientError');

  /**
   * Browser crash reports from the error screens (frontend components/error-screen.tsx).
   * Written to the server log only — `kubectl logs deploy/backend | grep ClientError`.
   */
  @Post('client-errors')
  reportClientError(@Body() body: Record<string, unknown>, @Req() req: any) {
    const s = (v: unknown, n: number) => (v == null ? null : String(v).slice(0, n));
    const u = req.user || {};
    this.clientLog.warn(
      JSON.stringify({
        user: s(u.name ?? u.email ?? u.id ?? u.sub, 120),
        role: s(u.role, 30),
        path: s(body?.path, 300),
        message: s(body?.message, 2000),
        digest: s(body?.digest, 100),
        userAgent: s(body?.userAgent, 300),
        stack: s(body?.stack, 8000),
      }),
    );
    return { ok: true };
  }
}
