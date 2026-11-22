import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../common/guards/permissions.guard.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';
import { ApiResponse } from '../common/dto/api-response.dto.js';
import { RmfHotelsService } from './rmf-hotels.service.js';
import { RmfHotelDto } from './dto/rmf-hotel.dto.js';

/** System Parameters › Routes › RMF Hotels (Marsa Alam hotels north / south of RMF, deep south). */
@Controller('rmf-hotels')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RmfHotelsController {
  constructor(private readonly service: RmfHotelsService) {}

  /** The list, for the Routes page and for Traffic Cover (notes → route). */
  @Get()
  @Permissions('driver-tariffs', 'dispatch')
  async findAll() {
    return new ApiResponse(await this.service.findAll());
  }

  @Post()
  @Permissions('driver-tariffs.upsert')
  async create(@Body() dto: RmfHotelDto) {
    return new ApiResponse(await this.service.create(dto), 'Hotel added');
  }

  @Patch(':id')
  @Permissions('driver-tariffs.upsert')
  async update(@Param('id') id: string, @Body() dto: Partial<RmfHotelDto>) {
    return new ApiResponse(await this.service.update(id, dto), 'Hotel updated');
  }

  @Delete(':id')
  @Permissions('driver-tariffs.delete')
  async remove(@Param('id') id: string) {
    await this.service.remove(id);
    return new ApiResponse(null, 'Hotel deleted');
  }
}
