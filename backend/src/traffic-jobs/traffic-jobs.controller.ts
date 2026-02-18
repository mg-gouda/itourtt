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
import { BulkCreateJobsDto } from './dto/bulk-create-jobs.dto.js';
import { JobFilterDto } from './dto/job-filter.dto.js';
import { UpdateJobDto } from './dto/update-job.dto.js';
import { UpdateStatusDto } from './dto/update-status.dto.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { PermissionsGuard } from '../common/guards/permissions.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { ApiResponse } from '../common/dto/api-response.dto.js';

@Controller('traffic-jobs')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class TrafficJobsController {
  constructor(private readonly trafficJobsService: TrafficJobsService) {}

  @Get()
  @Roles('ADMIN', 'MANAGER', 'DISPATCHER')
  @Permissions('traffic-jobs')
  async findAll(@Query() filter: JobFilterDto) {
    return this.trafficJobsService.findAll(filter);
  }

  @Get(':id')
  @Roles('ADMIN', 'MANAGER', 'DISPATCHER')
  @Permissions('traffic-jobs')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const job = await this.trafficJobsService.findOne(id);
    return new ApiResponse(job);
  }

  @Post('bulk')
  @Roles('ADMIN', 'MANAGER', 'DISPATCHER')
  @Permissions('traffic-jobs.b2b.importJobs')
  async bulkCreate(
    @Body() dto: BulkCreateJobsDto,
    @CurrentUser('id') userId: string,
  ) {
    const results = await this.trafficJobsService.bulkCreate(dto.jobs, userId);
    return new ApiResponse(results, `Created ${results.created} jobs`);
  }

  @Post()
  @Roles('ADMIN', 'MANAGER', 'DISPATCHER')
  @Permissions('traffic-jobs.online.createJob')
  async create(
    @Body() dto: CreateJobDto,
    @CurrentUser('id') userId: string,
  ) {
    const job = await this.trafficJobsService.create(dto, userId);
    return new ApiResponse(job, 'Traffic job created successfully');
  }

  @Patch(':id')
  @Roles('ADMIN', 'MANAGER', 'DISPATCHER')
  @Permissions('traffic-jobs.online.createJob')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateJobDto,
    @CurrentUser('id') userId: string,
  ) {
    const job = await this.trafficJobsService.update(id, dto, userId);
    return new ApiResponse(job, 'Traffic job updated successfully');
  }

  @Patch(':id/status')
  @Roles('ADMIN', 'MANAGER', 'DISPATCHER')
  @Permissions('traffic-jobs.online.table.statusFilter')
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStatusDto,
    @CurrentUser('id') userId: string,
  ) {
    const job = await this.trafficJobsService.updateStatus(id, dto, userId);
    return new ApiResponse(job, 'Traffic job status updated successfully');
  }

  @Delete(':id')
  @Roles('ADMIN', 'MANAGER', 'DISPATCHER')
  @Permissions('traffic-jobs.online.createJob')
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    const result = await this.trafficJobsService.remove(id);
    return new ApiResponse(result, 'Traffic job deleted successfully');
  }
}
