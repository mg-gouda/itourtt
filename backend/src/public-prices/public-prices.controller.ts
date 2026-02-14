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
import { PublicPricesService } from './public-prices.service.js';
import { UpsertPublicPricesDto } from './dto/upsert-public-prices.dto.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { PermissionsGuard } from '../common/guards/permissions.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';
import { ApiResponse } from '../common/dto/api-response.dto.js';
import { IsOptional, IsString, IsUUID } from 'class-validator';

class PublicPriceFilterDto {
  @IsOptional()
  @IsString()
  serviceType?: string;

  @IsOptional()
  @IsUUID()
  fromZoneId?: string;

  @IsOptional()
  @IsUUID()
  toZoneId?: string;

  @IsOptional()
  @IsUUID()
  vehicleTypeId?: string;
}

@Controller('public-prices')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class PublicPricesController {
  constructor(private readonly publicPricesService: PublicPricesService) {}

  @Get()
  @Permissions('public-prices')
  async findAll(@Query() filters: PublicPriceFilterDto) {
    const data = await this.publicPricesService.findAll(filters);
    return new ApiResponse(data);
  }

  @Post('bulk')
  @Permissions('public-prices.bulk')
  @Roles('ADMIN')
  async bulkUpsert(@Body() dto: UpsertPublicPricesDto) {
    const data = await this.publicPricesService.bulkUpsert(dto);
    return new ApiResponse(data, 'Public prices upserted successfully');
  }

  @Delete(':id')
  @Permissions('public-prices.delete')
  @Roles('ADMIN')
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.publicPricesService.remove(id);
    return new ApiResponse(null, 'Public price item deleted successfully');
  }
}
