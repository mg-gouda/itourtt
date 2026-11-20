import { Module } from '@nestjs/common';
import { JobAlertsService } from './job-alerts.service.js';
import { JobAlarmsPublicController } from './job-alarms-public.controller.js';

@Module({
  controllers: [JobAlarmsPublicController],
  providers: [JobAlertsService],
  exports: [JobAlertsService],
})
export class JobAlertsModule {}
