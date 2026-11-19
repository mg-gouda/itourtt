import { Module } from '@nestjs/common';
import { LocationsController } from './locations.controller.js';
import { LocationsService } from './locations.service.js';
import { GeocodingModule } from '../common/geocoding.module.js';
import { PinVerifierService } from './pin-verifier.service.js';

@Module({
  imports: [GeocodingModule],
  controllers: [LocationsController],
  providers: [LocationsService, PinVerifierService],
  exports: [LocationsService, PinVerifierService],
})
export class LocationsModule {}
