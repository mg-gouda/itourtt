import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';
import { SupplierPriceListsModule } from '../supplier-price-lists/supplier-price-lists.module.js';

@Module({
  imports: [SupplierPriceListsModule],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
