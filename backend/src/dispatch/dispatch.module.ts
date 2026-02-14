import { Module } from '@nestjs/common';
import { DispatchController } from './dispatch.controller.js';
import { DispatchService } from './dispatch.service.js';
import { EmailModule } from '../email/email.module.js';

@Module({
  imports: [EmailModule],
  controllers: [DispatchController],
  providers: [DispatchService],
  exports: [DispatchService],
})
export class DispatchModule {}
