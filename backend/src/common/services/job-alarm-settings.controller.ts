import {
  BadRequestException, Body, Controller, Delete, Get, Post, Put, Query, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { JwtAuthGuard } from '../guards/jwt-auth.guard.js';
import { RolesGuard } from '../guards/roles.guard.js';
import { PermissionsGuard } from '../guards/permissions.guard.js';
import { Roles } from '../decorators/roles.decorator.js';
import { Permissions } from '../decorators/permissions.decorator.js';
import { CurrentUser } from '../decorators/current-user.decorator.js';
import { ApiResponse } from '../dto/api-response.dto.js';
import { UpdateJobAlarmSettingsDto } from '../dto/job-alerts.dto.js';
import { JobAlertsService } from './job-alerts.service.js';

const soundDir = path.join(process.cwd(), 'uploads', 'alarm-sounds');
const AUDIO = /^audio\/(mpeg|mp3|wav|x-wav|wave|ogg|webm|mp4|x-m4a|aac)$/;

/**
 * Company › Alerts (6.5.0): how many job start alarms ring, when, who in the office is told
 * (users and roles), and the alarm sound the web portals and office popups play.
 */
@Controller('job-alarm-settings')
@UseGuards(JwtAuthGuard)
export class JobAlarmSettingsController {
  constructor(private readonly jobAlerts: JobAlertsService) {}

  /** Any signed-in user: the office popups and portals read the sound from here. */
  @Get()
  async get() {
    return new ApiResponse(await this.jobAlerts.alarmSettings());
  }

  @Put()
  @UseGuards(RolesGuard, PermissionsGuard)
  @Roles('ADMIN')
  @Permissions('company.editSettings')
  async save(@Body() dto: UpdateJobAlarmSettingsDto, @CurrentUser('id') userId: string) {
    return new ApiResponse(await this.jobAlerts.saveAlarmSettings(dto, userId), 'Alert settings saved');
  }

  @Post('sound')
  @UseGuards(RolesGuard, PermissionsGuard)
  @Roles('ADMIN')
  @Permissions('company.editSettings')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 2 * 1024 * 1024 },
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          fs.mkdirSync(soundDir, { recursive: true });
          cb(null, soundDir);
        },
        filename: (_req, file, cb) => {
          const ext = (path.extname(file.originalname) || '.mp3').toLowerCase().replace(/[^.a-z0-9]/g, '');
          cb(null, `${Date.now()}${ext}`);
        },
      }),
      fileFilter: (_req, file, cb) =>
        AUDIO.test(file.mimetype) ? cb(null, true) : cb(new BadRequestException('Upload an audio file (MP3, WAV, OGG, M4A)'), false),
    }),
  )
  async uploadSound(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser('id') userId: string,
    @Query('slot') slot?: string,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    const name = file.originalname.slice(0, 120);
    const url = `/uploads/alarm-sounds/${file.filename}`;
    // ?slot=N — that alarm's own sound (6.8.0); no slot — the shared sound for every alarm.
    const view = slot != null && slot !== ''
      ? await this.jobAlerts.setAlarmSlotSound(Number(slot), url, name, userId)
      : await this.jobAlerts.setAlarmSound(url, name, userId);
    return new ApiResponse(view, 'Alarm sound uploaded');
  }

  /** Back to the built-in two-tone sound. */
  @Delete('sound')
  @UseGuards(RolesGuard, PermissionsGuard)
  @Roles('ADMIN')
  @Permissions('company.editSettings')
  async resetSound(@CurrentUser('id') userId: string, @Query('slot') slot?: string) {
    const view = slot != null && slot !== ''
      ? await this.jobAlerts.setAlarmSlotSound(Number(slot), null, null, userId)
      : await this.jobAlerts.setAlarmSound(null, null, userId);
    return new ApiResponse(view, 'Alarm sound reset');
  }
}
