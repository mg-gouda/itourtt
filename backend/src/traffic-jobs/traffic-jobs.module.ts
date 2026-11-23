import { Module } from '@nestjs/common';
import { TrafficJobsController } from './traffic-jobs.controller.js';
import { TrafficJobsService } from './traffic-jobs.service.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { WhatsappNotificationsModule } from '../whatsapp-notifications/whatsapp-notifications.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { DriverTariffsModule } from '../driver-tariffs/driver-tariffs.module.js';
import { GoogleDriveModule } from '../google-drive/google-drive.module.js';
import { JobCompletionModule } from '../common/services/job-completion.module.js';
import { JobPricingModule } from '../job-pricing/job-pricing.module.js';
import { JobServiceTypesModule } from '../job-service-types/job-service-types.module.js';

@Module({
  imports: [NotificationsModule, WhatsappNotificationsModule, SettingsModule, DriverTariffsModule, GoogleDriveModule, JobCompletionModule, JobPricingModule, JobServiceTypesModule],
  controllers: [TrafficJobsController],
  providers: [TrafficJobsService],
  exports: [TrafficJobsService],
})
export class TrafficJobsModule {}
