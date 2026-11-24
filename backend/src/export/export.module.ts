import { Module } from '@nestjs/common';
import { ExportController } from './export.controller.js';
import { ExportService } from './export.service.js';
import { SurveyFilesController } from './survey-files.controller.js';
import { GoogleDriveModule } from '../google-drive/google-drive.module.js';

@Module({
  imports: [GoogleDriveModule],
  controllers: [ExportController, SurveyFilesController],
  providers: [ExportService],
  exports: [ExportService],
})
export class ExportModule {}
