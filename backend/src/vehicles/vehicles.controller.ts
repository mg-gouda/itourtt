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
import type { Response } from 'express';
import { VehiclesService } from './vehicles.service.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { ApiResponse } from '../common/dto/api-response.dto.js';
import { CreateVehicleTypeDto } from './dto/create-vehicle-type.dto.js';
import { CreateVehicleDto } from './dto/create-vehicle.dto.js';

@Controller('vehicles')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  // ─── Vehicle Types ────────────────────────────────────────

  @Get('types')
  findAllVehicleTypes() {
    return this.vehiclesService.findAllVehicleTypes();
  }

  @Post('types')
  @Roles('ADMIN')
  createVehicleType(@Body() dto: CreateVehicleTypeDto) {
    return this.vehiclesService.createVehicleType(dto);
  }

  // ─── Vehicles ─────────────────────────────────────────────

  @Get()
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
  createVehicle(@Body() dto: CreateVehicleDto) {
    return this.vehiclesService.createVehicle(dto);
  }

  @Get(':id')
  findVehicleById(@Param('id', ParseUUIDPipe) id: string) {
    return this.vehiclesService.findVehicleById(id);
  }

  @Patch(':id')
  @Roles('ADMIN', 'DISPATCHER')
  updateVehicle(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateVehicleDto,
  ) {
    return this.vehiclesService.updateVehicle(id, dto);
  }

  @Patch(':id/status')
  @Roles('ADMIN')
  async toggleStatus(@Param('id', ParseUUIDPipe) id: string) {
    const result = await this.vehiclesService.toggleStatus(id);
    return new ApiResponse(result, 'Vehicle status updated successfully');
  }

  @Delete(':id')
  @Roles('ADMIN')
  async softDelete(@Param('id', ParseUUIDPipe) id: string) {
    const result = await this.vehiclesService.softDelete(id);
    return new ApiResponse(result, 'Vehicle removed successfully');
  }
}
