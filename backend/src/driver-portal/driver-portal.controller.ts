import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { DriverPortalService } from './driver-portal.service.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { ApiResponse } from '../common/dto/api-response.dto.js';
import { IsString, IsIn, IsOptional } from 'class-validator';

const uploadsDir = path.join(process.cwd(), 'uploads', 'no-show');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const noShowStorage = diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const uniqueName = Date.now() + '-' + file.originalname;
    cb(null, uniqueName);
  },
});

class UpdateJobStatusDto {
  @IsString()
  @IsIn(['COMPLETED', 'CANCELLED'])
  status!: string;
}

class DateQueryDto {
  @IsOptional()
  @IsString()
  date?: string;
}

@Controller('driver-portal')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('DRIVER')
export class DriverPortalController {
  constructor(private readonly driverPortalService: DriverPortalService) {}

  @Get('jobs')
  async getMyJobs(
    @CurrentUser('id') userId: string,
    @Query() query: DateQueryDto,
  ) {
    const result = await this.driverPortalService.getMyJobs(userId, query.date);
    return new ApiResponse(result);
  }

  @Get('jobs/history')
  async getJobHistory(
    @CurrentUser('id') userId: string,
    @Query('dateFrom') dateFrom: string,
    @Query('dateTo') dateTo: string,
  ) {
    const today = new Date().toISOString().split('T')[0];
    const result = await this.driverPortalService.getJobHistory(
      userId,
      dateFrom || today,
      dateTo || today,
    );
    return new ApiResponse(result);
  }

  @Patch('jobs/:jobId/status')
  async updateJobStatus(
    @CurrentUser('id') userId: string,
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Body() dto: UpdateJobStatusDto,
  ) {
    const result = await this.driverPortalService.updateJobStatus(
      userId,
      jobId,
      dto.status as any,
    );
    return new ApiResponse(result, 'Job status updated');
  }

  @Post('jobs/:jobId/no-show')
  @UseInterceptors(FilesInterceptor('images', 2, { storage: noShowStorage }))
  async submitNoShow(
    @CurrentUser('id') userId: string,
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: { latitude: string; longitude: string },
  ) {
    if (!files || files.length < 2) {
      throw new BadRequestException(
        'Two images are required for no-show evidence',
      );
    }

    const imageUrl1 = '/uploads/no-show/' + files[0].filename;
    const imageUrl2 = '/uploads/no-show/' + files[1].filename;
    const latitude = parseFloat(body.latitude);
    const longitude = parseFloat(body.longitude);

    if (isNaN(latitude) || isNaN(longitude)) {
      throw new BadRequestException(
        'Valid GPS coordinates are required',
      );
    }

    const result = await this.driverPortalService.submitNoShow(
      userId,
      jobId,
      imageUrl1,
      imageUrl2,
      latitude,
      longitude,
    );
    return new ApiResponse(result, 'No-show evidence submitted');
  }

  @Get('notifications')
  async getNotifications(@CurrentUser('id') userId: string) {
    const result = await this.driverPortalService.getNotifications(userId);
    return new ApiResponse(result);
  }

  @Patch('notifications/:id/read')
  async markNotificationRead(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const result = await this.driverPortalService.markNotificationRead(userId, id);
    return new ApiResponse(result);
  }

  @Patch('notifications/read-all')
  async markAllRead(@CurrentUser('id') userId: string) {
    const result = await this.driverPortalService.markAllRead(userId);
    return new ApiResponse(result);
  }

  @Get('profile')
  async getProfile(@CurrentUser('id') userId: string) {
    const result = await this.driverPortalService.getProfile(userId);
    return new ApiResponse(result);
  }
}
