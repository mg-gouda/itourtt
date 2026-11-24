import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import * as express from 'express';
import { Public } from '../common/decorators/public.decorator.js';
import { verifyLink } from '../common/utils/signed-link.js';
import { ExportService } from './export.service.js';

/**
 * GET /api/survey-files/:token — one guest survey as PDF / Excel (6.2.1). The rep app gets the token
 * from POST /rep-portal/jobs/:jobId/survey/export-link (5-minute link) and opens it in the browser.
 */
@Public()
@Controller('survey-files')
export class SurveyFilesController {
  constructor(private readonly exportService: ExportService) {}

  @Get(':token')
  async download(@Param('token') token: string, @Res() res: express.Response) {
    const p = verifyLink<{ purpose: string; surveyId: string; format: 'pdf' | 'xlsx' }>(token);
    if (!p || p.purpose !== 'survey-export') throw new NotFoundException('This link has expired — export again from the app');
    const file = await this.exportService.guestSurveyFile(p.surveyId, p.format);
    res.setHeader('Content-Type', file.mime);
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(file.buffer);
  }
}
