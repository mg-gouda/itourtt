import { Module } from '@nestjs/common';
import { TrackingModule } from '../tracking/tracking.module.js';
import { RepPortalController } from './rep-portal.controller.js';
import { RepPortalService } from './rep-portal.service.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { GoogleDriveModule } from '../google-drive/google-drive.module.js';
import { JobCompletionModule } from '../common/services/job-completion.module.js';
import { JobAlertsModule } from '../common/services/job-alerts.module.js';

@Module({
  imports: [TrackingModule, NotificationsModule, GoogleDriveModule, JobCompletionModule, JobAlertsModule],
  controllers: [RepPortalController],
  providers: [RepPortalService],
})
export class RepPortalModule {}
