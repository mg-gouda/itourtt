import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { Public } from '../decorators/public.decorator.js';
import { ApiResponse } from '../dto/api-response.dto.js';
import { JobAlertsService } from './job-alerts.service.js';

/**
 * Job alarms for a phone whose rep / driver has signed out (header `X-Alarm-Key`, issued at sign-in by
 * POST /{rep|driver}-portal/alarm-device). Read-only start reminders + their acknowledgement.
 */
@Controller('public/alarms')
export class JobAlarmsPublicController {
  constructor(private readonly jobAlerts: JobAlertsService) {}

  /** GET /api/public/alarms — the person's upcoming start reminders. */
  @Public()
  @Get()
  async list(@Headers('x-alarm-key') key?: string) {
    return new ApiResponse(await this.jobAlerts.alarmsByKey(key));
  }

  /** POST /api/public/alarms/jobs/:jobId/ack — "I've seen it" from a signed-out phone. */
  @Public()
  @Post('jobs/:jobId/ack')
  async ack(@Headers('x-alarm-key') key: string | undefined, @Param('jobId') jobId: string, @Body() body: { kind: string; shownAt?: string }) {
    return new ApiResponse(await this.jobAlerts.acknowledgeByKey(key, jobId, body), 'Alert acknowledged');
  }

  /** POST /api/public/alarms/off — turn job alarms off on this phone. */
  @Public()
  @Post('off')
  async off(@Headers('x-alarm-key') key?: string) {
    return new ApiResponse(await this.jobAlerts.revokeAlarmKey(key), 'Alarms turned off on this phone');
  }
}
