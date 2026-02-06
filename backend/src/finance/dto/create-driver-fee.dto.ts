import {
  IsNotEmpty,
  IsUUID,
  IsNumber,
  IsPositive,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateDriverFeeDto {
  @IsUUID()
  @IsNotEmpty()
  trafficJobId!: string;

  @IsUUID()
  @IsNotEmpty()
  driverId!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;

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
