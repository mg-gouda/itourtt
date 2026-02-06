import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { VehiclesService } from './vehicles.service.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
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
}
