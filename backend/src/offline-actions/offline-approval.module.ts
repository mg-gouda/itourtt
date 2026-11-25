import { Module } from '@nestjs/common';
import { OfflineActionsModule } from './offline-actions.module.js';
import { RepPortalModule } from '../rep-portal/rep-portal.module.js';
import { DriverPortalModule } from '../driver-portal/driver-portal.module.js';
import { OfflineApprovalController } from './offline-approval.controller.js';

/** Office approval of late offline actions (6.9.0) — needs both portal services to apply them. */
@Module({
  imports: [OfflineActionsModule, RepPortalModule, DriverPortalModule],
  controllers: [OfflineApprovalController],
})
export class OfflineApprovalModule {}
