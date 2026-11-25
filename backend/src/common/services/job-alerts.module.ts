import { Module } from '@nestjs/common';
import { JobAlertsService } from './job-alerts.service.js';
import { JobAlarmsPublicController } from './job-alarms-public.controller.js';
import { JobAlarmSettingsController } from './job-alarm-settings.controller.js';

@Module({
  controllers: [JobAlarmsPublicController, JobAlarmSettingsController],
  providers: [JobAlertsService],
  exports: [JobAlertsService],
})
export class JobAlertsModule {}
