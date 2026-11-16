import { Module } from '@nestjs/common';
import { TrackingController } from './tracking.controller.js';
import { TrackingService } from './tracking.service.js';
import { RecordLocationInterceptor } from './record-location.interceptor.js';

@Module({
  controllers: [TrackingController],
  providers: [TrackingService, RecordLocationInterceptor],
  exports: [TrackingService, RecordLocationInterceptor],
})
export class TrackingModule {}
