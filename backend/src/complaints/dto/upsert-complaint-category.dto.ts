import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsIn,
  IsInt,
  IsBoolean,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { COMPLAINT_PARTIES } from './complaint-constants.js';

export class UpsertComplaintCategoryDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(120)
  nameEn!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(120)
  nameAr!: string;

  @IsOptional()
  @IsIn(COMPLAINT_PARTIES)
  defaultParty?: (typeof COMPLAINT_PARTIES)[number];

  // Points deducted from the rep/driver job score. Pay-affecting: a score that
  // drops a band changes the accounting fee, so this defaults to 0.
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  defaultPenaltyPoints?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
