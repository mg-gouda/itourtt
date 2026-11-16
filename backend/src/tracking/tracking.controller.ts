import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import { IsDateString, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { PermissionsGuard } from '../common/guards/permissions.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { ApiResponse } from '../common/dto/api-response.dto.js';
import { TrackingService, TrackedRole } from './tracking.service.js';

class LocationPingDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;

  /** Horizontal accuracy in metres, as reported by the device. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  accuracy?: number;

  /** When the device took the fix (ISO). Defaults to now; clamped if the clock is off. */
  @IsOptional()
  @IsDateString()
  recordedAt?: string;
}

class TrackingQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

@Controller('tracking')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class TrackingController {
  constructor(private readonly trackingService: TrackingService) {}

  /**
   * Portal heartbeat: a rep/driver portal posts its position about once a
   * minute while open. Not audited and not counted as session activity (see
   * AuditInterceptor / sessions.service › isBackgroundRequest).
   */
  @Post('ping')
  @HttpCode(204)
  @Roles('REP', 'DRIVER')
  async ping(@CurrentUser() user: { sub: string; role: string }, @Body() dto: LocationPingDto) {
    await this.trackingService.record(user.sub, user.role as TrackedRole, dto.latitude, dto.longitude, 'HEARTBEAT', {
      accuracy: dto.accuracy ?? null,
      recordedAt: dto.recordedAt ? new Date(dto.recordedAt) : null,
    });
  }

  /** Rep Tracking map: every active rep with last-known position and today's jobs. */
  @Get('reps')
  @Permissions('rep-tracking')
  async reps(@Query() query: TrackingQueryDto) {
    return new ApiResponse(await this.trackingService.listReps(query.search));
  }

  /** Driver Tracking map: every active driver with last-known position and today's jobs. */
  @Get('drivers')
  @Permissions('driver-tracking')
  async drivers(@Query() query: TrackingQueryDto) {
    return new ApiResponse(await this.trackingService.listDrivers(query.search));
  }

  /** Overall Tracking map: reps and drivers together (each row carries its role). */
  @Get('all')
  @Permissions('overall-tracking')
  async all(@Query() query: TrackingQueryDto) {
    return new ApiResponse(await this.trackingService.listAll(query.search));
  }
}
