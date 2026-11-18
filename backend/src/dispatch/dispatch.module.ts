import { Module } from '@nestjs/common';
import { DispatchController } from './dispatch.controller.js';
import { DispatchService } from './dispatch.service.js';
import { PermissionsGuard } from '../common/guards/permissions.guard.js';
import { EmailModule } from '../email/email.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { WhatsappNotificationsModule } from '../whatsapp-notifications/whatsapp-notifications.module.js';
import { B2CModule } from '../b2c/b2c.module.js';
import { SupplierPriceListsModule } from '../supplier-price-lists/supplier-price-lists.module.js';

@Module({
  imports: [EmailModule, NotificationsModule, WhatsappNotificationsModule, B2CModule, SupplierPriceListsModule],
  controllers: [DispatchController],
  providers: [DispatchService, PermissionsGuard],
  exports: [DispatchService],
})
export class DispatchModule {}
