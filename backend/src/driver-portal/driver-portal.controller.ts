import { TripKmService } from '../trip-km/trip-km.service.js';
import { FileInterceptor } from '@nestjs/platform-express';
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
  UploadedFile,
  ParseUUIDPipe,
  BadRequestException,
  Res,
} from '@nestjs/common';
import * as express from 'express';
import { ComplaintThreadService, sendComplaintFile } from '../complaints/complaint-thread.service.js';
import { RecordLocationInterceptor } from '../tracking/record-location.interceptor.js';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { DriverPortalService } from './driver-portal.service.js';
import { GoogleDriveService } from '../google-drive/google-drive.service.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { PermissionsGuard } from '../common/guards/permissions.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { ApiResponse } from '../common/dto/api-response.dto.js';
import { JobAlertsService } from '../common/services/job-alerts.service.js';
import { AckJobAlertDto } from '../common/dto/job-alerts.dto.js';
import { IsString, IsIn, IsOptional, IsNumber, IsBoolean } from 'class-validator';
import { stampEvidenceImage, StampMeta } from '../common/utils/stamp-image.js';

const uploadsDir = path.join(process.cwd(), 'uploads', 'no-show');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
const completedUploadsDir = path.join(process.cwd(), 'uploads', 'completed');
if (!fs.existsSync(completedUploadsDir)) {
  fs.mkdirSync(completedUploadsDir, { recursive: true });
}
const inProgressUploadsDir = path.join(process.cwd(), 'uploads', 'in-progress');
if (!fs.existsSync(inProgressUploadsDir)) {
  fs.mkdirSync(inProgressUploadsDir, { recursive: true });
}

const memStore = memoryStorage();

class UpdateJobStatusDto {
  @IsString()
  @IsIn(['IN_PROGRESS', 'COMPLETED', 'CANCELLED'])
  status!: string;

  // GPS is mandatory for every status change — never skipped.
  @IsNumber()
  latitude!: number;

  @IsNumber()
  longitude!: number;
}

class MarkCollectedDto {
  @IsBoolean()
  collected!: boolean;
}

class DateQueryDto {
  @IsOptional()
  @IsString()
  date?: string;
}

// RolesGuard alone yields to the permission system for any user with a
// roleId (i.e. every staff user), so it does not keep staff out of a portal.
// PermissionsGuard enforces @Roles against the account's role for everyone.
@Controller('driver-portal')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles('DRIVER')
@UseInterceptors(RecordLocationInterceptor)
export class DriverPortalController {
  constructor(
    private readonly driverPortalService: DriverPortalService,
    private readonly googleDriveService: GoogleDriveService,
    private readonly jobAlerts: JobAlertsService,
    private readonly complaintThreads: ComplaintThreadService,
    private readonly tripKm: TripKmService,
  ) {}

  /**
   * Job alarms: start reminders (60 / 30 min before) for jobs not started yet,
   * and the drop-off geofence for a started trip. Polled by the portal and app.
   */
  @Get('alerts')
  async getAlerts(@CurrentUser('id') userId: string) {
    return new ApiResponse(await this.jobAlerts.getAlerts(userId, 'DRIVER'));
  }

  /** POST /driver-portal/alarm-device — this phone's alarm key, so job alarms keep working after sign-out. */
  @Post('alarm-device')
  async alarmDevice(@CurrentUser('id') userId: string) {
    return new ApiResponse(await this.jobAlerts.registerAlarmDevice(userId, 'DRIVER'));
  }

  /** Acknowledge an alarm; the request itself is the activity-log entry. */
  @Post('jobs/:jobId/alerts/ack')
  async ackAlert(
    @CurrentUser('id') userId: string,
    @Param('jobId') jobId: string,
    @Body() dto: AckJobAlertDto,
  ) {
    return new ApiResponse(await this.jobAlerts.acknowledge(userId, 'DRIVER', jobId, dto), 'Alert acknowledged');
  }

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

  @Get('jobs/:jobId')
  async getJobDetail(
    @CurrentUser('id') userId: string,
    @Param('jobId') jobId: string,
  ) {
    const job = await this.driverPortalService.findJobDetail(userId, jobId);
    return new ApiResponse(job);
  }

  @Patch('jobs/:jobId/status')
  async updateJobStatus(
    @CurrentUser('id') userId: string,
    @Param('jobId') jobId: string,
    @Body() dto: UpdateJobStatusDto,
  ) {
    const result = await this.driverPortalService.updateJobStatus(
      userId,
      jobId,
      dto.status as any,
      dto.latitude,
      dto.longitude,
    );
    return new ApiResponse(result, 'Job status updated');
  }

  @Patch('jobs/:jobId/collection')
  async markCollected(
    @CurrentUser('id') userId: string,
    @Param('jobId') jobId: string,
    @Body() dto: MarkCollectedDto,
  ) {
    const result = await this.driverPortalService.markCollected(userId, jobId, dto.collected);
    return new ApiResponse(result, 'Collection status updated');
  }

  @Post('jobs/:jobId/no-show')
  @UseInterceptors(FilesInterceptor('images', 10, { storage: memStore }))
  async submitNoShow(
    @CurrentUser('id') userId: string,
    @Param('jobId') jobId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: { latitude: string; longitude: string },
  ) {
    if (!files || files.length < 1) {
      throw new BadRequestException('At least one image is required for no-show evidence');
    }

    // GPS is mandatory: reject the evidence upload when a fix is missing so
    // location is never absent from the audit trail.
    const latitude = parseFloat(body.latitude);
    const longitude = parseFloat(body.longitude);
    if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
      throw new BadRequestException('Valid GPS coordinates are required');
    }

    const stampMeta = await this.driverPortalService.getJobStampMeta(jobId, 'NO_SHOW').catch((e) => { console.error('[stamp] getJobStampMeta failed:', e); return undefined; });
    await this.driverPortalService.precheckGeofence(userId, jobId, 'NO_SHOW', latitude, longitude);
    const imageUrls = await this.uploadFiles(files, jobId, 'no-show', 'no-show', latitude, longitude, stampMeta);

    const result = await this.driverPortalService.submitNoShow(userId, jobId, imageUrls, latitude, longitude);
    return new ApiResponse(result, 'No-show evidence submitted');
  }

  @Post('jobs/:jobId/in-progress')
  @UseInterceptors(FilesInterceptor('images', 10, { storage: memStore }))
  async submitInProgress(
    @CurrentUser('id') userId: string,
    @Param('jobId') jobId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: { latitude: string; longitude: string },
  ) {
    if (!files || files.length < 1) {
      throw new BadRequestException('At least one image is required for in-progress evidence');
    }

    // GPS is mandatory: reject the evidence upload when a fix is missing so
    // location is never absent from the audit trail.
    const latitude = parseFloat(body.latitude);
    const longitude = parseFloat(body.longitude);
    if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
      throw new BadRequestException('Valid GPS coordinates are required');
    }

    const stampMeta = await this.driverPortalService.getJobStampMeta(jobId, 'IN_PROGRESS').catch((e) => { console.error('[stamp] getJobStampMeta failed:', e); return undefined; });
    await this.driverPortalService.precheckGeofence(userId, jobId, 'IN_PROGRESS', latitude, longitude);
    const imageUrls = await this.uploadFiles(files, jobId, 'driver', 'in-progress', latitude, longitude, stampMeta);

    const result = await this.driverPortalService.submitInProgress(userId, jobId, imageUrls, latitude, longitude);
    return new ApiResponse(result, 'In-progress evidence submitted');
  }

  @Post('jobs/:jobId/completed')
  @UseInterceptors(FilesInterceptor('images', 10, { storage: memStore }))
  async submitCompleted(
    @CurrentUser('id') userId: string,
    @Param('jobId') jobId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: { latitude: string; longitude: string; odometerKm?: string },
  ) {
    if (!files || files.length < 1) {
      throw new BadRequestException('At least one image is required for completed evidence');
    }
    // Owned car: the odometer photo (read by AI, or typed after two failed reads) is required.
    const odometer = await this.tripKm.assertForCompletion(
      await this.driverPortalService.resolveDriverId(userId),
      jobId,
      body.odometerKm,
    );

    // GPS is mandatory: reject the evidence upload when a fix is missing so
    // location is never absent from the audit trail.
    const latitude = parseFloat(body.latitude);
    const longitude = parseFloat(body.longitude);
    if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
      throw new BadRequestException('Valid GPS coordinates are required');
    }

    const stampMeta = await this.driverPortalService.getJobStampMeta(jobId, 'COMPLETED').catch((e) => { console.error('[stamp] getJobStampMeta failed:', e); return undefined; });
    await this.driverPortalService.precheckGeofence(userId, jobId, 'COMPLETED', latitude, longitude);
    const imageUrls = await this.uploadFiles(files, jobId, 'driver', 'completed', latitude, longitude, stampMeta);

    const result = await this.driverPortalService.submitCompleted(userId, jobId, imageUrls, latitude, longitude);
    if (odometer) await this.tripKm.confirm(odometer.id);
    return new ApiResponse(result, 'Completed evidence submitted');
  }

  /** GET /driver-portal/jobs/:jobId/odometer — does completing need an odometer photo, and what was read. */
  @Get('jobs/:jobId/odometer')
  async odometerStatus(@CurrentUser('id') userId: string, @Param('jobId') jobId: string) {
    const driverId = await this.driverPortalService.resolveDriverId(userId);
    return new ApiResponse(await this.tripKm.statusForDriver(driverId, jobId));
  }

  /** POST /driver-portal/jobs/:jobId/odometer — odometer photo (field `image`); AI reads the km. */
  @Post('jobs/:jobId/odometer')
  @UseInterceptors(FileInterceptor('image', { storage: memStore, limits: { fileSize: 15 * 1024 * 1024 } }))
  async odometerCapture(
    @CurrentUser('id') userId: string,
    @Param('jobId') jobId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const driverId = await this.driverPortalService.resolveDriverId(userId);
    return new ApiResponse(await this.tripKm.capture(driverId, jobId, file));
  }

  @Get('complaints')
  async getComplaints(@CurrentUser('id') userId: string) {
    const result = await this.driverPortalService.getComplaints(userId);
    return new ApiResponse(result);
  }

  /** GET /driver-portal/complaints/:id — a complaint that names this driver: the story (no money) and their thread. */
  @Get('complaints/:id')
  async getComplaint(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    const driverId = await this.driverPortalService.resolveDriverId(userId);
    return new ApiResponse(await this.complaintThreads.detailForParty('DRIVER', driverId, id));
  }

  /** POST /driver-portal/complaints/:id/messages — answer with text and/or evidence (multipart: message, files ≤10 images/PDF). */
  @Post('complaints/:id/messages')
  @UseInterceptors(FilesInterceptor('files', 10, { storage: memStore, limits: { fileSize: 15 * 1024 * 1024 } }))
  async answerComplaint(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('message') message: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    const driverId = await this.driverPortalService.resolveDriverId(userId);
    const msg = await this.complaintThreads.addMessage({ complaintId: id, party: 'DRIVER', author: 'PARTY', partyId: driverId, userId, message, files });
    return new ApiResponse(msg, 'Answer sent');
  }

  /** GET /driver-portal/complaints/:id/attachments/:attId — a file from their own thread. */
  @Get('complaints/:id/attachments/:attId')
  async complaintFile(
    @CurrentUser('id') userId: string,
    @Param('attId', ParseUUIDPipe) attId: string,
    @Res() res: express.Response,
  ) {
    const driverId = await this.driverPortalService.resolveDriverId(userId);
    sendComplaintFile(res, await this.complaintThreads.openAttachment(attId, { party: 'DRIVER', partyId: driverId }));
  }

  /** GET /driver-portal/deductions?dateFrom=&dateTo= — posted deductions against this driver, with the reason. */
  @Get('deductions')
  async getDeductions(
    @CurrentUser('id') userId: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const result = await this.driverPortalService.getDeductions(userId, dateFrom, dateTo);
    return new ApiResponse(result);
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

  // ──────────────────────────────────────────────────────────────────────────
  // Upload helper — tries Drive first, falls back to local disk
  // ──────────────────────────────────────────────────────────────────────────

  private async uploadFiles(
    files: Express.Multer.File[],
    jobId: string,
    driveType: 'rep' | 'driver' | 'no-show',
    localSubdir: string,
    lat?: number | null,
    lng?: number | null,
    meta?: StampMeta,
  ): Promise<string[]> {
    const uploadsBase = path.join(process.cwd(), 'uploads');
    // Stamp and upload in parallel: run serially, a pair of photos waited on two
    // full sharp + Drive round trips back to back before the job could complete.
    return Promise.all(
      files.map(async (file, i) => {
        // Always stamp: date/time + rep/driver/status are burned in even when no
        // GPS fix was captured (the GPS line reads "Not captured"). Skipping the
        // stamp on null coords would drop all evidence metadata, not just GPS.
        const buffer = await stampEvidenceImage(file.buffer, lat, lng, undefined, meta).catch(
          () => file.buffer,
        );

        // The index keeps names unique: iOS calls every camera shot "image.jpg".
        const uniqueName =
          Date.now() + '-' + i + '-' + file.originalname.replace(/\.[^.]+$/, '') + '.jpg';
        const mimeType = 'image/jpeg';

        const driveId = await this.googleDriveService.uploadFile(
          buffer,
          uniqueName,
          mimeType,
          jobId,
          driveType,
        );
        if (driveId) return driveId;

        // Drive not configured or unreachable — save to local disk as fallback
        const dir = path.join(uploadsBase, localSubdir);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, uniqueName), buffer);
        return `/uploads/${localSubdir}/${uniqueName}`;
      }),
    );
  }
}
