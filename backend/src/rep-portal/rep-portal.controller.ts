import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { RepPortalService } from './rep-portal.service.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { ApiResponse } from '../common/dto/api-response.dto.js';
import { IsString, IsIn, IsOptional } from 'class-validator';

class UpdateJobStatusDto {
  @IsString()
  @IsIn(['COMPLETED', 'CANCELLED', 'NO_SHOW'])
  status!: string;
}

class DateQueryDto {
  @IsOptional()
  @IsString()
  date?: string;
}

@Controller('rep-portal')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('REP')
export class RepPortalController {
  constructor(private readonly repPortalService: RepPortalService) {}

  @Get('jobs')
  async getMyJobs(
    @CurrentUser('id') userId: string,
    @Query() query: DateQueryDto,
  ) {
    const result = await this.repPortalService.getMyJobs(userId, query.date);
    return new ApiResponse(result);
  }

  @Get('jobs/history')
  async getJobHistory(
    @CurrentUser('id') userId: string,
    @Query('date') date: string,
  ) {
    const result = await this.repPortalService.getJobHistory(userId, date || new Date().toISOString().split('T')[0]);
    return new ApiResponse(result);
  }

  @Patch('jobs/:jobId/status')
  async updateJobStatus(
    @CurrentUser('id') userId: string,
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Body() dto: UpdateJobStatusDto,
  ) {
    const result = await this.repPortalService.updateJobStatus(
      userId,
      jobId,
      dto.status as any,
    );
    return new ApiResponse(result, 'Job status updated');
  }

  @Get('notifications')
  async getNotifications(@CurrentUser('id') userId: string) {
    const result = await this.repPortalService.getNotifications(userId);
    return new ApiResponse(result);
  }

  @Patch('notifications/:id/read')
  async markNotificationRead(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const result = await this.repPortalService.markNotificationRead(userId, id);
    return new ApiResponse(result);
  }

  @Patch('notifications/read-all')
  async markAllRead(@CurrentUser('id') userId: string) {
    const result = await this.repPortalService.markAllRead(userId);
    return new ApiResponse(result);
  }

  @Get('profile')
  async getProfile(@CurrentUser('id') userId: string) {
    const result = await this.repPortalService.getProfile(userId);
    return new ApiResponse(result);
  }
}
