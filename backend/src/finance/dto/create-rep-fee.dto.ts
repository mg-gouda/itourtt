import {
  IsNotEmpty,
  IsUUID,
  IsNumber,
  IsPositive,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateRepFeeDto {
  @IsUUID()
  @IsNotEmpty()
  trafficJobId!: string;

  @IsUUID()
  @IsNotEmpty()
  repId!: string;

  @IsNumber()
  @IsPositive()
  @IsOptional()
  amount?: number;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsNumber()
  @IsOptional()
  exchangeRate?: number;

  @IsString()
  @IsOptional()
  notes?: string;
}
