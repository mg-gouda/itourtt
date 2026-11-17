import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Public } from '../common/decorators/public.decorator.js';

/**
 * Android app downloads (sideloading, outside Google Play). The APKs sit on
 * the uploads volume in a dot-folder (`uploads/.apps/itour-<app>.apk`) so
 * the auth-gated /uploads route never touches them; this route serves them
 * publicly. The apps themselves still require a rep/driver login.
 */
const APPS_DIR = path.join(process.cwd(), 'uploads', '.apps');
const APPS = { driver: 'itour-driver.apk', rep: 'itour-rep.apk' } as const;

@Controller('public/apps')
export class MobileAppsController {
  /** GET /api/public/apps/driver.apk | rep.apk */
  @Public()
  @Get(':file')
  async download(@Param('file') file: string, @Res() res: Response) {
    const app = file.replace(/\.apk$/, '') as keyof typeof APPS;
    const name = APPS[app];
    if (!name) throw new NotFoundException('Unknown app');
    const abs = path.join(APPS_DIR, name);
    try {
      await fs.access(abs);
    } catch {
      throw new NotFoundException('This app is not available yet');
    }
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(abs, { dotfiles: 'allow' }, (err) => {
      if (err && !res.headersSent) res.status(404).json({ statusCode: 404, message: 'Not found' });
    });
  }
}
