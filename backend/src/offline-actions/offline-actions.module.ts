import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module.js';
import { OfflineActionsService } from './offline-actions.service.js';

/** The offline-action service the rep / driver portals use (6.9.0). */
@Module({
  imports: [ChatModule],
  providers: [OfflineActionsService],
  exports: [OfflineActionsService],
})
export class OfflineActionsModule {}
