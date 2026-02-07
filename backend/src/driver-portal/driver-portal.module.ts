import { Module } from '@nestjs/common';
import { DriverPortalController } from './driver-portal.controller.js';
import { DriverPortalService } from './driver-portal.service.js';

@Module({
  controllers: [DriverPortalController],
  providers: [DriverPortalService],
})
export class DriverPortalModule {}
