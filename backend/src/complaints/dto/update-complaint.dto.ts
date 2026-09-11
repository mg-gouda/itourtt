import {
  IsOptional,
  IsString,
  IsUUID,
  IsIn,
  IsInt,
  IsNumber,
  IsDateString,
  IsArray,
  ArrayMaxSize,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import {
  COMPLAINT_STAGES,
  COMPLAINT_SOURCES,
  COMPLAINT_PARTIES,
  COMPLAINT_OUTCOMES,
  CURRENCIES,
} from './complaint-constants.js';

/**
 * Everything editable on a complaint EXCEPT its status and its job.
 * Status moves only through POST /complaints/:id/transition, so the lifecycle
 * rules and date stamping can never be bypassed by a plain PATCH.
 */
export class UpdateComplaintDto {
  /** The primary category — see CreateComplaintDto.categoryId. */
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  /**
   * Replaces the whole category set — see CreateComplaintDto.categoryIds.
   * Omitted leaves it alone.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID(undefined, { each: true })
  categoryIds?: string[];

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

  /** When we replied — see CreateComplaintDto.repliedAt. Null clears it. */
  @IsOptional()
  @IsDateString()
  repliedAt?: string | null;

  /** WON / LOST — see CreateComplaintDto.outcome. Null puts it back undecided. */
  @IsOptional()
  @IsIn(COMPLAINT_OUTCOMES)
  outcome?: (typeof COMPLAINT_OUTCOMES)[number] | null;

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

  /**
   * Replaces the whole set of responsible parties — see
   * CreateComplaintDto.responsibleParties. Omitted leaves it alone.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(COMPLAINT_PARTIES.length)
  @IsIn(COMPLAINT_PARTIES, { each: true })
  responsibleParties?: (typeof COMPLAINT_PARTIES)[number][];

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
