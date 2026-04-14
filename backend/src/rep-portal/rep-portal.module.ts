import { Module } from '@nestjs/common';
import { RepPortalController } from './rep-portal.controller.js';
import { RepPortalService } from './rep-portal.service.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { GoogleDriveModule } from '../google-drive/google-drive.module.js';

@Module({
  imports: [NotificationsModule, GoogleDriveModule],
  controllers: [RepPortalController],
  providers: [RepPortalService],
})
export class RepPortalModule {}
