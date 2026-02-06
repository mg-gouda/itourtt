import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { TrafficJobsService } from './traffic-jobs.service.js';
import { CreateJobDto } from './dto/create-job.dto.js';
import { JobFilterDto } from './dto/job-filter.dto.js';
import { UpdateStatusDto } from './dto/update-status.dto.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { ApiResponse } from '../common/dto/api-response.dto.js';

@Controller('traffic-jobs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TrafficJobsController {
  constructor(private readonly trafficJobsService: TrafficJobsService) {}

  @Get()
  @Roles('ADMIN', 'MANAGER', 'DISPATCHER')
  async findAll(@Query() filter: JobFilterDto) {
    return this.trafficJobsService.findAll(filter);
  }

  @Get(':id')
  @Roles('ADMIN', 'MANAGER', 'DISPATCHER')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const job = await this.trafficJobsService.findOne(id);
    return new ApiResponse(job);
  }

  @Post()
  @Roles('ADMIN', 'MANAGER', 'DISPATCHER')
  async create(
    @Body() dto: CreateJobDto,
    @CurrentUser('id') userId: string,
  ) {
    const job = await this.trafficJobsService.create(dto, userId);
    return new ApiResponse(job, 'Traffic job created successfully');
  }

  @Patch(':id/status')
  @Roles('ADMIN', 'MANAGER', 'DISPATCHER')
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStatusDto,
  ) {
    const job = await this.trafficJobsService.updateStatus(id, dto);
    return new ApiResponse(job, 'Traffic job status updated successfully');
  }

  @Delete(':id')
  @Roles('ADMIN', 'MANAGER', 'DISPATCHER')
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    const result = await this.trafficJobsService.remove(id);
    return new ApiResponse(result, 'Traffic job deleted successfully');
  }
}
