import { Controller, Get, Query, Param, Res, UseGuards, BadRequestException, NotFoundException, ParseUUIDPipe } from '@nestjs/common';
import * as express from 'express';
import { ExportService } from './export.service.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { PermissionsGuard } from '../common/guards/permissions.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';

@Controller('export/odoo')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles('ADMIN', 'MANAGER', 'ACCOUNTANT')
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Get('dispatch')
  @Roles('ADMIN', 'MANAGER', 'DISPATCHER')
  @Permissions('dispatch.exportButton')
  async exportDispatchDay(
    @Query('date') date: string,
    @Res() res: express.Response,
  ) {
    if (!date) {
      throw new BadRequestException('date query parameter is required');
    }
    const buffer = await this.exportService.exportDispatchDay(date);
    this.sendXlsx(res, buffer, `dispatch_${date}`);
  }

  @Get('rep-fees')
  @Permissions('reports.repFees')
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
  @Permissions('finance.exports.customers')
  async exportCustomers(@Res() res: express.Response) {
    const buffer = await this.exportService.exportCustomers();
    this.sendXlsx(res, buffer, 'odoo_customers');
  }

  @Get('suppliers')
  @Permissions('finance.exports.suppliers')
  async exportSuppliers(@Res() res: express.Response) {
    const buffer = await this.exportService.exportSuppliers();
    this.sendXlsx(res, buffer, 'odoo_suppliers');
  }

  @Get('invoices')
  @Permissions('finance.exports.invoices')
  async exportInvoices(@Res() res: express.Response) {
    const buffer = await this.exportService.exportInvoices();
    this.sendXlsx(res, buffer, 'odoo_customer_invoices');
  }

  @Get('vendor-bills')
  @Permissions('finance.exports.vendorBills')
  async exportVendorBills(@Res() res: express.Response) {
    const buffer = await this.exportService.exportVendorBills();
    this.sendXlsx(res, buffer, 'odoo_vendor_bills');
  }

  @Get('payments')
  @Permissions('finance.exports.payments')
  async exportPayments(@Res() res: express.Response) {
    const buffer = await this.exportService.exportPayments();
    this.sendXlsx(res, buffer, 'odoo_payments');
  }

  @Get('journals')
  @Permissions('finance.exports.journals')
  async exportJournalEntries(@Res() res: express.Response) {
    const buffer = await this.exportService.exportJournalEntries();
    this.sendXlsx(res, buffer, 'odoo_journal_entries');
  }

  @Get('collections')
  @Permissions('finance.exports.collections')
  async exportCollections(
    @Query('status') status: string,
    @Query('dateFrom') dateFrom: string,
    @Query('dateTo') dateTo: string,
    @Res() res: express.Response,
  ) {
    const buffer = await this.exportService.exportCollections(status, dateFrom, dateTo);
    this.sendXlsx(res, buffer, 'odoo_collections');
  }

  @Get('client-signs')
  @Roles('ADMIN', 'MANAGER', 'DISPATCHER')
  @Permissions('dispatch.exportButton')
  async exportClientSigns(
    @Query('date') date: string,
    @Res() res: express.Response,
  ) {
    if (!date) {
      throw new BadRequestException('date query parameter is required');
    }
    try {
      const buffer = await this.exportService.generateClientSigns(date);
      const dateStr = new Date().toISOString().split('T')[0];
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="client_signs_${date}_${dateStr}.pdf"`,
        'Content-Length': buffer.length.toString(),
      });
      res.end(buffer);
    } catch (err: any) {
      if (err.message === 'NO_SIGN_JOBS') {
        throw new NotFoundException('No jobs with print sign for this date');
      }
      throw err;
    }
  }

  @Get('daily-dispatch')
  @Roles('ADMIN', 'MANAGER', 'DISPATCHER')
  @Permissions('reports.dailyDispatch')
  async exportDailyDispatch(
    @Query('date') date: string,
    @Res() res: express.Response,
  ) {
    if (!date) {
      throw new BadRequestException('date query parameter is required');
    }
    const buffer = await this.exportService.exportDailyDispatchReport(date);
    this.sendXlsx(res, buffer, `daily_dispatch_${date}`);
  }

  @Get('driver-trips')
  @Roles('ADMIN', 'MANAGER', 'DISPATCHER', 'ACCOUNTANT')
  @Permissions('reports.driverTrips')
  async exportDriverTrips(
    @Query('from') from: string,
    @Query('to') to: string,
    @Res() res: express.Response,
  ) {
    if (!from || !to) {
      throw new BadRequestException('from and to query parameters are required');
    }
    const buffer = await this.exportService.exportDriverTrips(from, to);
    this.sendXlsx(res, buffer, `driver_trips_${from}_${to}`);
  }

  @Get('agent-statement/:agentId')
  @Roles('ADMIN', 'MANAGER', 'ACCOUNTANT')
  @Permissions('reports.agentStatement')
  async exportAgentStatement(
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Res() res: express.Response,
  ) {
    if (!from || !to) {
      throw new BadRequestException('from and to query parameters are required');
    }
    const buffer = await this.exportService.exportAgentStatement(agentId, from, to);
    this.sendXlsx(res, buffer, `agent_statement_${from}_${to}`);
  }

  @Get('revenue')
  @Permissions('reports.revenue')
  async exportRevenue(
    @Query('from') from: string,
    @Query('to') to: string,
    @Res() res: express.Response,
  ) {
    if (!from || !to) {
      throw new BadRequestException('from and to query parameters are required');
    }
    const buffer = await this.exportService.exportRevenue(from, to);
    this.sendXlsx(res, buffer, `revenue_${from}_${to}`);
  }

  @Get('vehicle-compliance')
  @Roles('ADMIN', 'MANAGER', 'DISPATCHER')
  @Permissions('reports.vehicleCompliance')
  async exportVehicleCompliance(@Res() res: express.Response) {
    const buffer = await this.exportService.exportVehicleCompliance();
    this.sendXlsx(res, buffer, 'vehicle_compliance');
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
