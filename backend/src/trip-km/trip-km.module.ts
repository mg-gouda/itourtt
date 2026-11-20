import { Module } from '@nestjs/common';
import { GoogleDriveModule } from '../google-drive/google-drive.module.js';
import { TripKmController } from './trip-km.controller.js';
import { TripKmService } from './trip-km.service.js';

/** Odometer readings at job completion (owned cars) and the Odoo Fleet export. */
@Module({
  imports: [GoogleDriveModule],
  controllers: [TripKmController],
  providers: [TripKmService],
  exports: [TripKmService],
})
export class TripKmModule {}
