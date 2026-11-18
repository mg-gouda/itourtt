import { Module } from '@nestjs/common';
import { JobAlertsService } from './job-alerts.service.js';

@Module({
  providers: [JobAlertsService],
  exports: [JobAlertsService],
})
export class JobAlertsModule {}
