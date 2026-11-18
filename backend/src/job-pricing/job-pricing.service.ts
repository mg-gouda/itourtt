import { Injectable } from '@nestjs/common';
import { SupplierCostingService } from '../supplier-price-lists/supplier-costing.service.js';
import { CustomerPricingService } from './customer-pricing.service.js';

/**
 * The one call every job write makes after it changes a job's route, customer or
 * assignment: re-cost the supplier side and re-price the customer side. Both
 * halves guard themselves (posted / manual / invoiced rows are left alone) and
 * never throw.
 */
@Injectable()
export class JobPricingService {
  constructor(
    private readonly supplierCosting: SupplierCostingService,
    private readonly customerPricing: CustomerPricingService,
  ) {}

  async syncJob(trafficJobId: string) {
    const [supplierCost, customerPrice] = await Promise.all([
      this.supplierCosting.syncJobCost(trafficJobId),
      this.customerPricing.syncJobPrice(trafficJobId),
    ]);
    return { supplierCost, customerPrice };
  }
}
