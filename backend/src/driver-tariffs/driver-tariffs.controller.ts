import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { DriverTariffsService } from './driver-tariffs.service.js';
import { UpsertTariffDto } from './dto/upsert-tariff.dto.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { PermissionsGuard } from '../common/guards/permissions.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';
import { ApiResponse } from '../common/dto/api-response.dto.js';
import { IsOptional, IsString } from 'class-validator';

class TariffFilterDto {
  @IsOptional() @IsString() fromZoneId?: string;
  @IsOptional() @IsString() toZoneId?: string;
  @IsOptional() @IsString() vehicleTypeId?: string;
}

@Controller('driver-tariffs')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class DriverTariffsController {
  constructor(private readonly driverTariffsService: DriverTariffsService) {}

  @Get()
  @Permissions('driver-tariffs')
  async findAll(@Query() filters: TariffFilterDto) {
    const data = await this.driverTariffsService.findAll(filters);
    return new ApiResponse(data);
  }

  @Post()
  @Roles('ADMIN', 'DISPATCHER')
  @Permissions('driver-tariffs.upsert')
  async upsert(@Body() dto: UpsertTariffDto) {
    const data = await this.driverTariffsService.upsert(dto);
    return new ApiResponse(data, 'Driver tariff saved successfully');
  }

  @Delete(':id')
  @Roles('ADMIN')
  @Permissions('driver-tariffs.delete')
  async remove(@Param('id') id: string) {
    await this.driverTariffsService.remove(id);
    return new ApiResponse(null, 'Driver tariff deleted successfully');
  }
}
