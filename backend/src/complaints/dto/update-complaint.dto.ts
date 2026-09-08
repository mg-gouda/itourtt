import {
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

/**
 * Everything editable on a complaint EXCEPT its status and its job.
 * Status moves only through POST /complaints/:id/transition, so the lifecycle
 * rules and date stamping can never be bypassed by a plain PATCH.
 */
export class UpdateComplaintDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  /** The agent this complaint is with — see CreateComplaintDto.agentId. */
  @IsOptional()
  @IsUUID()
  agentId?: string;

  @IsOptional()
  @IsIn(COMPLAINT_STAGES)
  stage?: (typeof COMPLAINT_STAGES)[number];

  @IsOptional()
  @IsIn(COMPLAINT_SOURCES)
  source?: (typeof COMPLAINT_SOURCES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(300)
  subject?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  complaintDate?: string;

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
