import {
  IsNotEmpty,
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

export class CreateComplaintDto {
  // Named `trafficJobId` deliberately: AuditInterceptor.resolveJob reads this key
  // out of the request body to link the activity-log row to the job.
  @IsUUID()
  trafficJobId!: string;

  /**
   * The primary category. Optional when `categoryIds` is sent — the first entry
   * becomes the primary — and kept for callers that only ever name one.
   */
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  /**
   * Every category this complaint falls under. One incident is often several
   * things at once. The first is stored as `categoryId`; all of them are
   * written to the link table, so a filter on any of them finds the complaint.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID(undefined, { each: true })
  categoryIds?: string[];

  /**
   * The agent this complaint is with. Defaults to the job's agent when omitted.
   * This is the agent any conceded amount is owed to, so it drives the
   * AgentAdjustment and any credit note — not merely a label.
   */
  @IsOptional()
  @IsUUID()
  agentId?: string;

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

  /**
   * When we actually replied. Normally stamped by the REPLIED transition, but
   * it can be logged directly for a reply that went out over email or phone.
   * Null clears it and puts the complaint back inside the countdown.
   */
  @IsOptional()
  @IsDateString()
  repliedAt?: string | null;

  /**
   * WON means we conceded nothing; LOST is what makes the amounts below
   * meaningful. Null while the outcome is still undecided.
   */
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

  /** The primary responsible party. Defaults to the first of `responsibleParties`. */
  @IsOptional()
  @IsIn(COMPLAINT_PARTIES)
  responsibleParty?: (typeof COMPLAINT_PARTIES)[number];

  /**
   * Everyone at fault — a late driver who was also rude is both. DRIVER, REP and
   * SUPPLIER each resolve their person from the job's assignment, so no id has
   * to be sent for them.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(COMPLAINT_PARTIES.length)
  @IsIn(COMPLAINT_PARTIES, { each: true })
  responsibleParties?: (typeof COMPLAINT_PARTIES)[number][];

  /** Overrides the driver resolved from the job's assignment. */
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
