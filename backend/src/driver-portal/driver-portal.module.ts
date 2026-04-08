import { Module } from '@nestjs/common';
import { DriverPortalController } from './driver-portal.controller.js';
import { DriverPortalService } from './driver-portal.service.js';
import { NoShowDisputeService } from './no-show-dispute.service.js';
import { EmailModule } from '../email/email.module.js';

@Module({
  imports: [EmailModule],
  controllers: [DriverPortalController],
  providers: [DriverPortalService, NoShowDisputeService],
})
export class DriverPortalModule {}
