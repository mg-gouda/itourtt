import { TripKmModule } from '../trip-km/trip-km.module.js';
import { ComplaintsModule } from '../complaints/complaints.module.js';
import { Module } from '@nestjs/common';
import { TrackingModule } from '../tracking/tracking.module.js';
import { DriverPortalController } from './driver-portal.controller.js';
import { DriverPortalService } from './driver-portal.service.js';
import { NoShowDisputeService } from './no-show-dispute.service.js';
import { SupplierAutoCompleteService } from './supplier-auto-complete.service.js';
import { EmailModule } from '../email/email.module.js';
import { GoogleDriveModule } from '../google-drive/google-drive.module.js';
import { JobCompletionModule } from '../common/services/job-completion.module.js';
import { JobAlertsModule } from '../common/services/job-alerts.module.js';
import { OfflineActionsModule } from '../offline-actions/offline-actions.module.js';

@Module({
  imports: [TripKmModule, ComplaintsModule, TrackingModule, EmailModule, GoogleDriveModule, JobCompletionModule, JobAlertsModule, OfflineActionsModule],
  controllers: [DriverPortalController],
  providers: [DriverPortalService, NoShowDisputeService, SupplierAutoCompleteService],
  exports: [DriverPortalService],
})
export class DriverPortalModule {}
