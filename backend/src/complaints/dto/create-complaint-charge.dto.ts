import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { COMPLAINT_PARTIES, CURRENCIES } from './complaint-constants.js';

/**
 * Raising a charge records an intent to deduct. Nothing reaches the party's
 * fee table until the charge is separately approved and then posted.
 *
 * The job is what a deduction always has. `complaintId` is optional: omitted,
 * the deduction stands on the job alone and the next complaint logged against
 * it adopts it.
 */
export class CreateComplaintChargeDto {
  // Named exactly `trafficJobId` so AuditInterceptor.resolveJob picks it out of
  // the body and links the deduction to the job in the Activity Log.
  @IsUUID()
  trafficJobId!: string;

  @IsOptional()
  @IsUUID()
  complaintId?: string;

  @IsIn(COMPLAINT_PARTIES)
  party!: (typeof COMPLAINT_PARTIES)[number];

  @IsOptional()
  @IsUUID()
  driverId?: string;

  @IsOptional()
  @IsUUID()
  repId?: string;

  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsIn(CURRENCIES)
  currency?: (typeof CURRENCIES)[number];

  /** Why the money is being taken. Free text, kept on the charge. */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

/**
 * Overriding a deduction that is already on the row — the amount typed on the
 * dispatch grid, corrected on the complaint. Only a PENDING charge may be
 * changed; once approved, what was approved is what stands.
 */
export class UpdateComplaintChargeDto {
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @IsOptional()
  @IsIn(CURRENCIES)
  currency?: (typeof CURRENCIES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class VoidComplaintChargeDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(500)
  reason!: string;
}
