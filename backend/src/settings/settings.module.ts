import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { EmailModule } from '../email/email.module.js';
import { GoogleDriveModule } from '../google-drive/google-drive.module.js';
import { SettingsService } from './settings.service.js';
import { SettingsController } from './settings.controller.js';

@Module({
  imports: [PrismaModule, EmailModule, GoogleDriveModule],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
