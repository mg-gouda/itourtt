import { Module } from '@nestjs/common';
import { FinanceController } from './finance.controller.js';
import { FinanceService } from './finance.service.js';
import { InvoiceExportService } from './invoice-export.service.js';

@Module({
  controllers: [FinanceController],
  providers: [FinanceService, InvoiceExportService],
  exports: [FinanceService],
})
export class FinanceModule {}
