import { Module, Global } from '@nestjs/common';
import { PushNotificationsService } from './push-notifications.service.js';
import { WebPushService } from './web-push.service.js';
import { WebPushController } from './web-push.controller.js';
import { PartyNotificationsService } from './party-notifications.service.js';

@Global()
@Module({
  controllers: [WebPushController],
  providers: [PushNotificationsService, WebPushService, PartyNotificationsService],
  exports: [PushNotificationsService, WebPushService, PartyNotificationsService],
})
export class PushNotificationsModule {}
