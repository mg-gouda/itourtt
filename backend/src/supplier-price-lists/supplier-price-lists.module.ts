import { Module } from '@nestjs/common';
import { SupplierPriceListsController } from './supplier-price-lists.controller.js';
import { SupplierPriceListsService } from './supplier-price-lists.service.js';
import { SupplierCostingService } from './supplier-costing.service.js';

@Module({
  controllers: [SupplierPriceListsController],
  providers: [SupplierPriceListsService, SupplierCostingService],
  exports: [SupplierCostingService],
})
export class SupplierPriceListsModule {}
