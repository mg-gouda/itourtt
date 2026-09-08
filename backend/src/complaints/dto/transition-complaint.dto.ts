import {
  IsIn,
  IsOptional,
  IsNumber,
  IsString,
  Min,
  MaxLength,
} from 'class-validator';
import { COMPLAINT_STATUSES, CURRENCIES } from './complaint-constants.js';

/**
 * The only way a complaint's status changes. The service validates the move
 * against VALID_TRANSITIONS and stamps repliedAt / resolvedAt itself.
 */
export class TransitionComplaintDto {
  @IsIn(COMPLAINT_STATUSES)
  status!: (typeof COMPLAINT_STATUSES)[number];

  /** Required when moving to LOST; must be below claimedAmount for PARTIALLY_LOST. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  lossAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  claimedAmount?: number;

  @IsOptional()
  @IsIn(CURRENCIES)
  currency?: (typeof CURRENCIES)[number];

  @IsOptional()
  @IsNumber()
  @Min(0.0001)
  exchangeRate?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
