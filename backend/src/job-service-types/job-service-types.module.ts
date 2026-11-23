import { Module } from '@nestjs/common';
import { JobServiceTypesController } from './job-service-types.controller.js';
import { JobServiceTypesService } from './job-service-types.service.js';
import { RmfHotelsController } from './rmf-hotels.controller.js';
import { RmfHotelsService } from './rmf-hotels.service.js';
import { RouteResolverService } from './route-resolver.service.js';

@Module({
  controllers: [JobServiceTypesController, RmfHotelsController],
  providers: [JobServiceTypesService, RmfHotelsService, RouteResolverService],
  exports: [JobServiceTypesService, RouteResolverService],
})
export class JobServiceTypesModule {}
