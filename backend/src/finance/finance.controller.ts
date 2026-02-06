import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { FinanceService } from './finance.service.js';
import { CreateDriverFeeDto } from './dto/create-driver-fee.dto.js';
import { CreateRepFeeDto } from './dto/create-rep-fee.dto.js';
import { CreateSupplierCostDto } from './dto/create-supplier-cost.dto.js';
import { CreateInvoiceDto } from './dto/create-invoice.dto.js';
import { CreatePaymentDto } from './dto/create-payment.dto.js';
import { GenerateCustomerInvoicesDto } from './dto/create-customer-invoice.dto.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { ApiResponse } from '../common/dto/api-response.dto.js';
import { IsOptional, IsUUID, IsString, IsDateString } from 'class-validator';

class RepDailyFeeQueryDto {
  @IsDateString()
  date!: string;
}

class InvoiceListQueryDto extends PaginationDto {
  @IsOptional()
  @IsUUID()
  agentId?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

class CustomerInvoiceListQueryDto extends PaginationDto {
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsString()
  invoiceType?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

@Controller('finance')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'MANAGER', 'ACCOUNTANT')
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  // ─── Driver Fees ─────────────────────────────

  @Post('driver-fees')
  async createDriverFee(
    @Body() dto: CreateDriverFeeDto,
    @CurrentUser('id') userId: string,
  ) {
    const fee = await this.financeService.createDriverFee(dto, userId);
    return new ApiResponse(fee, 'Driver fee created successfully');
  }

  // ─── Rep Fees ────────────────────────────────

  @Post('rep-fees')
  async createRepFee(
    @Body() dto: CreateRepFeeDto,
    @CurrentUser('id') userId: string,
  ) {
    const fee = await this.financeService.createRepFee(dto, userId);
    return new ApiResponse(fee, 'Rep fee created successfully');
  }

  @Get('rep-fees/:repId/daily')
  async getRepDailyFees(
    @Param('repId', ParseUUIDPipe) repId: string,
    @Query() query: RepDailyFeeQueryDto,
  ) {
    const result = await this.financeService.getRepDailyFees(repId, query.date);
    return new ApiResponse(result);
  }

  // ─── Supplier Costs ──────────────────────────

  @Post('supplier-costs')
  async createSupplierCost(
    @Body() dto: CreateSupplierCostDto,
    @CurrentUser('id') userId: string,
  ) {
    const cost = await this.financeService.createSupplierCost(dto, userId);
    return new ApiResponse(cost, 'Supplier cost created successfully');
  }

  // ─── Invoices ────────────────────────────────

  @Post('invoices')
  async createInvoice(
    @Body() dto: CreateInvoiceDto,
    @CurrentUser('id') userId: string,
  ) {
    const invoice = await this.financeService.createInvoice(dto, userId);
    return new ApiResponse(invoice, 'Invoice created successfully');
  }

  @Get('invoices')
  async listInvoices(@Query() query: InvoiceListQueryDto) {
    const { agentId, status, ...pagination } = query;
    return this.financeService.listInvoices(pagination, agentId, status);
  }

  @Get('invoices/:id')
  async getInvoice(@Param('id', ParseUUIDPipe) id: string) {
    const invoice = await this.financeService.getInvoice(id);
    return new ApiResponse(invoice);
  }

  // ─── Payments ────────────────────────────────

  @Post('payments')
  async createPayment(
    @Body() dto: CreatePaymentDto,
    @CurrentUser('id') userId: string,
  ) {
    const payment = await this.financeService.createPayment(dto, userId);
    return new ApiResponse(payment, 'Payment recorded successfully');
  }

  // ─── Job Financials ──────────────────────────

  @Get('jobs/:jobId/financials')
  async getJobFinancials(
    @Param('jobId', ParseUUIDPipe) jobId: string,
  ) {
    const financials = await this.financeService.getJobFinancials(jobId);
    return new ApiResponse(financials);
  }

  // ─── Customer Invoices ─────────────────────────

  @Post('customer-invoices/generate')
  async generateCustomerInvoices(
    @Body() dto: GenerateCustomerInvoicesDto,
    @CurrentUser('id') userId: string,
  ) {
    const result = await this.financeService.generateCustomerInvoices(dto, userId);
    return new ApiResponse(result, 'Customer invoices generated successfully');
  }

  @Get('customer-invoices')
  async listCustomerInvoices(@Query() query: CustomerInvoiceListQueryDto) {
    const { customerId, invoiceType, status, ...pagination } = query;
    return this.financeService.listCustomerInvoices(pagination, customerId, invoiceType, status);
  }

  @Get('customer-invoices/:id')
  async getCustomerInvoice(@Param('id', ParseUUIDPipe) id: string) {
    const invoice = await this.financeService.getCustomerInvoice(id);
    return new ApiResponse(invoice);
  }
}
