import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller.js';
import { ChatService } from './chat.service.js';
import { PermissionsGuard } from '../common/guards/permissions.guard.js';

@Module({
  controllers: [ChatController],
  providers: [ChatService, PermissionsGuard],
  exports: [ChatService],
})
export class ChatModule {}
