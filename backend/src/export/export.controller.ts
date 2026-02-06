import { Controller, Get, Query, Res, UseGuards, BadRequestException } from '@nestjs/common';
import * as express from 'express';
import { ExportService } from './export.service.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';

@Controller('export/odoo')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'MANAGER', 'ACCOUNTANT')
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Get('rep-fees')
  async exportRepFees(
    @Query('date') date: string,
    @Res() res: express.Response,
  ) {
    if (!date) {
      throw new BadRequestException('date query parameter is required');
    }
    const buffer = await this.exportService.exportRepFees(date);
    this.sendXlsx(res, buffer, `rep_fees_${date}`);
  }

  @Get('customers')
  async exportCustomers(@Res() res: express.Response) {
    const buffer = await this.exportService.exportCustomers();
    this.sendXlsx(res, buffer, 'odoo_customers');
  }

  @Get('suppliers')
  async exportSuppliers(@Res() res: express.Response) {
    const buffer = await this.exportService.exportSuppliers();
    this.sendXlsx(res, buffer, 'odoo_suppliers');
  }

  @Get('invoices')
  async exportInvoices(@Res() res: express.Response) {
    const buffer = await this.exportService.exportInvoices();
    this.sendXlsx(res, buffer, 'odoo_customer_invoices');
  }

  @Get('vendor-bills')
  async exportVendorBills(@Res() res: express.Response) {
    const buffer = await this.exportService.exportVendorBills();
    this.sendXlsx(res, buffer, 'odoo_vendor_bills');
  }

  @Get('payments')
  async exportPayments(@Res() res: express.Response) {
    const buffer = await this.exportService.exportPayments();
    this.sendXlsx(res, buffer, 'odoo_payments');
  }

  @Get('journals')
  async exportJournalEntries(@Res() res: express.Response) {
    const buffer = await this.exportService.exportJournalEntries();
    this.sendXlsx(res, buffer, 'odoo_journal_entries');
  }

  private sendXlsx(res: express.Response, buffer: Buffer, filename: string) {
    const date = new Date().toISOString().split('T')[0];
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}_${date}.xlsx"`,
      'Content-Length': buffer.length.toString(),
    });
    res.end(buffer);
  }
}
