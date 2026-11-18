import { Module } from '@nestjs/common';
import { TrafficJobsModule } from '../traffic-jobs/traffic-jobs.module.js';
import { B2bExcelImportController } from './b2b-excel-import.controller.js';
import { B2bExcelImportService } from './b2b-excel-import.service.js';

@Module({
  imports: [TrafficJobsModule],
  controllers: [B2bExcelImportController],
  providers: [B2bExcelImportService],
})
export class B2bExcelImportModule {}
