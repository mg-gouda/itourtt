import { Module } from '@nestjs/common';
import { JobServiceTypesController } from './job-service-types.controller.js';
import { JobServiceTypesService } from './job-service-types.service.js';
import { RmfHotelsController } from './rmf-hotels.controller.js';
import { RmfHotelsService } from './rmf-hotels.service.js';

@Module({
  controllers: [JobServiceTypesController, RmfHotelsController],
  providers: [JobServiceTypesService, RmfHotelsService],
  exports: [JobServiceTypesService],
})
export class JobServiceTypesModule {}
