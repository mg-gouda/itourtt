import { Module } from '@nestjs/common';
import { SupplierPriceListsModule } from '../supplier-price-lists/supplier-price-lists.module.js';
import { CustomerPricingService } from './customer-pricing.service.js';
import { JobPricingService } from './job-pricing.service.js';
import { RoutePricesService } from './route-prices.service.js';
import { RoutePricesController } from './route-prices.controller.js';

/** Job money from price lists: supplier cost (via SupplierPriceListsModule) + customer price + driver tips. */
@Module({
  imports: [SupplierPriceListsModule],
  controllers: [RoutePricesController],
  providers: [CustomerPricingService, JobPricingService, RoutePricesService],
  exports: [JobPricingService, CustomerPricingService],
})
export class JobPricingModule {}
