import { Module } from '@nestjs/common';
import { GuestBookingsController } from './guest-bookings.controller.js';
import { GuestBookingsService } from './guest-bookings.service.js';
import { EmailModule } from '../email/email.module.js';
import { JobServiceTypesModule } from '../job-service-types/job-service-types.module.js';

@Module({
  imports: [EmailModule, JobServiceTypesModule],
  controllers: [GuestBookingsController],
  providers: [GuestBookingsService],
  exports: [GuestBookingsService],
})
export class GuestBookingsModule {}
