import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Max, Min,
} from 'class-validator';

/** POST /{rep,driver}-portal/jobs/:jobId/alerts/ack */
export class AckJobAlertDto {
  /** START_<minutes> (as set in Company › Alerts) or DROPOFF_ARRIVED / DROPOFF_LEFT. */
  @IsString()
  @Matches(/^(START_\d{1,3}|DROPOFF_ARRIVED|DROPOFF_LEFT)$/)
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

  /** UI review 2a: "Seen" on the earlier alarms, "On the way" on the last. Missing = On the way (older apps). */
  @IsOptional()
  @IsIn(['SEEN', 'ON_THE_WAY'])
  answer?: 'SEEN' | 'ON_THE_WAY';
}

/** POST /rep-portal/jobs/:jobId/escort */
export class RepEscortDto {
  @IsBoolean()
  escort!: boolean;
}

/** PUT /job-alarm-settings — Company › Alerts. */
export class UpdateJobAlarmSettingsDto {
  /** Minutes before the job, one per alarm (1–5 alarms, 5–360 min each). */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @IsInt({ each: true })
  @Min(5, { each: true })
  @Max(360, { each: true })
  alarmMinutes!: number[];

  @IsInt()
  @Min(1)
  @Max(60)
  missedAfterMinutes!: number;

  /** 0 = no warning. */
  @IsInt()
  @Min(0)
  @Max(240)
  warnBeforeMinutes!: number;

  @IsArray()
  @IsString({ each: true })
  recipientRoleIds!: string[];

  @IsArray()
  @IsString({ each: true })
  recipientUserIds!: string[];
}
