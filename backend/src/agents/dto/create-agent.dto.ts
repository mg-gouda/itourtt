import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  IsEnum,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Currency } from '../../../generated/prisma/enums.js';

export class CreateAgentDto {
  @IsString()
  @IsNotEmpty()
  legalName!: string;

  @IsString()
  @IsOptional()
  tradeName?: string;

  @IsString()
  @IsOptional()
  taxId?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  country?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsEmail()
  @IsOptional()
  disputeEmail?: string;

  @IsEnum(Currency)
  @IsOptional()
  currency?: string;

  @IsString()
  @IsOptional()
  refPattern?: string;

  @IsString()
  @IsOptional()
  refExample?: string;

  /**
   * This agent's own NO SHOW wait, in minutes. Null — the normal case — means
   * the company default applies; only agents who negotiated something else
   * carry a number. `Standard` covers arrivals, day tours, going and return;
   * `Dep` covers departures, which are much shorter.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(720)
  noShowWaitStandardMinutes?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(720)
  noShowWaitDepMinutes?: number | null;
}
