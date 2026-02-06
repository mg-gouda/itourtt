import {
  IsNotEmpty,
  IsUUID,
  IsNumber,
  IsPositive,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateSupplierCostDto {
  @IsUUID()
  @IsNotEmpty()
  trafficJobId!: string;

  @IsUUID()
  @IsNotEmpty()
  supplierId!: string;

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
