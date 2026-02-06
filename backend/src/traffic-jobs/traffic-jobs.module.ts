import { Module } from '@nestjs/common';
import { TrafficJobsController } from './traffic-jobs.controller.js';
import { TrafficJobsService } from './traffic-jobs.service.js';

@Module({
  controllers: [TrafficJobsController],
  providers: [TrafficJobsService],
  exports: [TrafficJobsService],
})
export class TrafficJobsModule {}
