import { IsBoolean, IsIn, IsNumber, IsOptional, IsString } from 'class-validator';
import { ALERT_KINDS } from '../services/job-alerts.service.js';

/** POST /{rep,driver}-portal/jobs/:jobId/alerts/ack */
export class AckJobAlertDto {
  @IsString()
  @IsIn(ALERT_KINDS as unknown as string[])
  kind!: string;

  /** When the alarm appeared on screen (ISO). */
  @IsOptional()
  @IsString()
  shownAt?: string;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;
}

/** POST /rep-portal/jobs/:jobId/escort */
export class RepEscortDto {
  @IsBoolean()
  escort!: boolean;
}
