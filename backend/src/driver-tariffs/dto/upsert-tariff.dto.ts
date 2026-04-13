import { IsNumber, IsOptional, IsString, IsBoolean, Min, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';

export class UpsertTariffDto {
  @IsString()
  @IsNotEmpty()
  fromZoneId: string;

  @IsString()
  @IsNotEmpty()
  toZoneId: string;

  @IsString()
  @IsNotEmpty()
  vehicleTypeId: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  amount: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  jobServiceTypeId?: string;
}
