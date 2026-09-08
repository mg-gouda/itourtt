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
 */
export class CreateComplaintChargeDto {
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
}

export class VoidComplaintChargeDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(500)
  reason!: string;
}
