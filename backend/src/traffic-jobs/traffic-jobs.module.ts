import { Module } from '@nestjs/common';
import { TrafficJobsController } from './traffic-jobs.controller.js';
import { TrafficJobsService } from './traffic-jobs.service.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { WhatsappNotificationsModule } from '../whatsapp-notifications/whatsapp-notifications.module.js';

@Module({
  imports: [NotificationsModule, WhatsappNotificationsModule],
  controllers: [TrafficJobsController],
  providers: [TrafficJobsService],
  exports: [TrafficJobsService],
})
export class TrafficJobsModule {}
