import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseUUIDPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import type { Response } from 'express';
import { VehiclesService } from './vehicles.service.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { PermissionsGuard } from '../common/guards/permissions.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { ApiResponse } from '../common/dto/api-response.dto.js';
import { CreateVehicleTypeDto } from './dto/create-vehicle-type.dto.js';
import { CreateVehicleDto } from './dto/create-vehicle.dto.js';
import { UpsertVehicleComplianceDto } from './dto/upsert-vehicle-compliance.dto.js';
import { CreateDepositPaymentDto } from './dto/create-deposit-payment.dto.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';

const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const uploadStorage = diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const uniqueName = Date.now() + '-' + file.originalname;
    cb(null, uniqueName);
  },
});

@Controller('vehicles')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  // ─── Vehicle Types ────────────────────────────────────────

  @Get('types')
  @Permissions('vehicles')
  findAllVehicleTypes() {
    return this.vehiclesService.findAllVehicleTypes();
  }

  @Post('types')
  @Roles('ADMIN')
  @Permissions('vehicles.types.addButton')
  createVehicleType(@Body() dto: CreateVehicleTypeDto) {
    return this.vehiclesService.createVehicleType(dto);
  }

  // ─── Vehicles ─────────────────────────────────────────────

  @Get()
  @Permissions('vehicles')
  findAllVehicles(
    @Query() pagination: PaginationDto,
    @Query('vehicleTypeId') vehicleTypeId?: string,
  ) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;
    return this.vehiclesService.findAllVehicles(page, limit, vehicleTypeId);
  }

  @Get('export/excel')
  @Roles('ADMIN', 'DISPATCHER')
  @Permissions('vehicles.export')
  async exportExcel(@Res() res: Response) {
    const buffer = await this.vehiclesService.exportToExcel();
    const date = new Date().toISOString().split('T')[0];
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="vehicles_${date}.xlsx"`,
      'Content-Length': buffer.length.toString(),
    });
    res.end(buffer);
  }

  @Get('import/template')
  @Roles('ADMIN', 'DISPATCHER')
  @Permissions('vehicles.downloadTemplate')
  async downloadTemplate(@Res() res: Response) {
    const buffer = await this.vehiclesService.generateImportTemplate();
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="vehicles_import_template.xlsx"',
      'Content-Length': buffer.length.toString(),
    });
    res.end(buffer);
  }

  @Post('import/excel')
  @Roles('ADMIN', 'DISPATCHER')
  @Permissions('vehicles.import')
  @UseInterceptors(FileInterceptor('file'))
  async importExcel(@UploadedFile() file: any) {
    if (!file) {
      return new ApiResponse({ imported: 0, errors: ['No file uploaded'] }, 'No file uploaded');
    }
    const result = await this.vehiclesService.importFromExcel(file.buffer);
    const message = result.errors.length > 0
      ? `Imported ${result.imported} vehicles with ${result.errors.length} errors`
      : `Successfully imported ${result.imported} vehicles`;
    return new ApiResponse(result, message);
  }

  @Post()
  @Roles('ADMIN')
  @Permissions('vehicles.addButton')
  createVehicle(@Body() dto: CreateVehicleDto) {
    return this.vehiclesService.createVehicle(dto);
  }

  // ─── Vehicle Compliance ─────────────────────────────────

  @Get('compliance/report')
  @Roles('ADMIN', 'DISPATCHER', 'ACCOUNTANT')
  @Permissions('vehicles')
  async complianceReport() {
    const result = await this.vehiclesService.getComplianceReport();
    return new ApiResponse(result);
  }

  @Get(':id/compliance')
  @Permissions('vehicles')
  async getCompliance(@Param('id', ParseUUIDPipe) id: string) {
    const result = await this.vehiclesService.getCompliance(id);
    return new ApiResponse(result);
  }

  @Patch(':id/compliance')
  @Roles('ADMIN', 'DISPATCHER')
  @Permissions('vehicles.table.editButton')
  async upsertCompliance(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpsertVehicleComplianceDto,
  ) {
    const result = await this.vehiclesService.upsertCompliance(id, dto);
    return new ApiResponse(result, 'Compliance data updated');
  }

  @Post(':id/compliance/license')
  @Roles('ADMIN', 'DISPATCHER')
  @Permissions('vehicles.table.editButton')
  @UseInterceptors(FileInterceptor('file', { storage: uploadStorage }))
  async uploadLicenseCopy(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: any,
  ) {
    const url = '/uploads/' + file.filename;
    await this.vehiclesService.updateComplianceFile(id, 'licenseCopyUrl', url);
    return { url };
  }

  @Post(':id/compliance/insurance')
  @Roles('ADMIN', 'DISPATCHER')
  @Permissions('vehicles.table.editButton')
  @UseInterceptors(FileInterceptor('file', { storage: uploadStorage }))
  async uploadInsuranceDoc(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: any,
  ) {
    const url = '/uploads/' + file.filename;
    await this.vehiclesService.updateComplianceFile(id, 'insuranceDocUrl', url);
    return { url };
  }

  // ─── Deposit Payments ────────────────────────────────

  @Get(':id/deposits')
  @Roles('ADMIN', 'DISPATCHER', 'ACCOUNTANT')
  @Permissions('vehicles')
  async listDeposits(@Param('id', ParseUUIDPipe) id: string) {
    const result = await this.vehiclesService.listDepositPayments(id);
    return new ApiResponse(result);
  }

  @Post(':id/deposits')
  @Roles('ADMIN', 'DISPATCHER')
  @Permissions('vehicles.table.editButton')
  async addDeposit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateDepositPaymentDto,
    @CurrentUser('id') userId: string,
  ) {
    const result = await this.vehiclesService.addDepositPayment(id, dto, userId);
    return new ApiResponse(result, 'Deposit payment added');
  }

  @Delete(':id/deposits/:depositId')
  @Roles('ADMIN')
  @Permissions('vehicles.table.deleteButton')
  async removeDeposit(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('depositId', ParseUUIDPipe) depositId: string,
  ) {
    await this.vehiclesService.removeDepositPayment(id, depositId);
    return new ApiResponse(null, 'Deposit payment removed');
  }

  @Get(':id')
  @Permissions('vehicles')
  findVehicleById(@Param('id', ParseUUIDPipe) id: string) {
    return this.vehiclesService.findVehicleById(id);
  }

  @Patch(':id')
  @Roles('ADMIN', 'DISPATCHER')
  @Permissions('vehicles.table.editButton')
  updateVehicle(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateVehicleDto,
  ) {
    return this.vehiclesService.updateVehicle(id, dto);
  }

  @Patch(':id/status')
  @Roles('ADMIN')
  @Permissions('vehicles.table.toggleStatus')
  async toggleStatus(@Param('id', ParseUUIDPipe) id: string) {
    const result = await this.vehiclesService.toggleStatus(id);
    return new ApiResponse(result, 'Vehicle status updated successfully');
  }

  @Delete(':id')
  @Roles('ADMIN')
  @Permissions('vehicles.table.deleteButton')
  async softDelete(@Param('id', ParseUUIDPipe) id: string) {
    const result = await this.vehiclesService.softDelete(id);
    return new ApiResponse(result, 'Vehicle removed successfully');
  }
}
