import { Module } from '@nestjs/common';
import { RepPortalController } from './rep-portal.controller.js';
import { RepPortalService } from './rep-portal.service.js';

@Module({
  controllers: [RepPortalController],
  providers: [RepPortalService],
})
export class RepPortalModule {}
