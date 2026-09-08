import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  IsIn,
  IsInt,
  IsNumber,
  IsDateString,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import {
  COMPLAINT_STAGES,
  COMPLAINT_SOURCES,
  COMPLAINT_PARTIES,
  CURRENCIES,
} from './complaint-constants.js';

export class CreateComplaintDto {
  // Named `trafficJobId` deliberately: AuditInterceptor.resolveJob reads this key
  // out of the request body to link the activity-log row to the job.
  @IsUUID()
  trafficJobId!: string;

  @IsUUID()
  categoryId!: string;

  @IsIn(COMPLAINT_STAGES)
  stage!: (typeof COMPLAINT_STAGES)[number];

  @IsOptional()
  @IsIn(COMPLAINT_SOURCES)
  source?: (typeof COMPLAINT_SOURCES)[number];

  @IsNotEmpty()
  @IsString()
  @MaxLength(300)
  subject!: string;

  @IsNotEmpty()
  @IsString()
  description!: string;

  @IsDateString()
  complaintDate!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  slaHours?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  claimedAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  lossAmount?: number;

  @IsOptional()
  @IsIn(CURRENCIES)
  currency?: (typeof CURRENCIES)[number];

  @IsOptional()
  @IsNumber()
  @Min(0.0001)
  exchangeRate?: number;

  @IsOptional()
  @IsIn(COMPLAINT_PARTIES)
  responsibleParty?: (typeof COMPLAINT_PARTIES)[number];

  @IsOptional()
  @IsUUID()
  responsibleDriverId?: string;

  @IsOptional()
  @IsUUID()
  responsibleRepId?: string;

  @IsOptional()
  @IsUUID()
  responsibleSupplierId?: string;

  @IsOptional()
  @IsUUID()
  assignedToId?: string;
}
