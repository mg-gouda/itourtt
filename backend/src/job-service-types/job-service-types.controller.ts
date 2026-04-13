import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, UseGuards,
} from '@nestjs/common';
import { JobServiceTypesService } from './job-service-types.service.js';
import { CreateJobServiceTypeDto } from './dto/create-job-service-type.dto.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../common/guards/permissions.guard.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';
import { ApiResponse } from '../common/dto/api-response.dto.js';

@Controller('job-service-types')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class JobServiceTypesController {
  constructor(private readonly service: JobServiceTypesService) {}

  @Get()
  @Permissions('driver-tariffs')
  async findAll() {
    return new ApiResponse(await this.service.findAll());
  }

  @Post()
  @Permissions('driver-tariffs.upsert')
  async create(@Body() dto: CreateJobServiceTypeDto) {
    return new ApiResponse(await this.service.create(dto), 'Service type created');
  }

  @Patch(':id')
  @Permissions('driver-tariffs.upsert')
  async update(@Param('id') id: string, @Body() dto: Partial<CreateJobServiceTypeDto>) {
    return new ApiResponse(await this.service.update(id, dto), 'Service type updated');
  }

  @Delete(':id')
  @Permissions('driver-tariffs.delete')
  async remove(@Param('id') id: string) {
    await this.service.remove(id);
    return new ApiResponse(null, 'Service type deleted');
  }
}
