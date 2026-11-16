import { Module, Global } from '@nestjs/common';
import { PushNotificationsService } from './push-notifications.service.js';
import { WebPushService } from './web-push.service.js';
import { WebPushController } from './web-push.controller.js';

@Global()
@Module({
  controllers: [WebPushController],
  providers: [PushNotificationsService, WebPushService],
  exports: [PushNotificationsService, WebPushService],
})
export class PushNotificationsModule {}
