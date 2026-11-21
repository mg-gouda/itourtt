import { IsNotEmpty, IsOptional, IsString, IsBoolean, IsInt, Min, Max } from 'class-validator';

export class AssignJobDto {
  @IsNotEmpty()
  @IsString()
  trafficJobId!: string;

  @IsOptional()
  @IsString()
  vehicleId?: string;

  @IsOptional()
  @IsString()
  driverId?: string;

  @IsOptional()
  @IsString()
  repId?: string;

  @IsOptional()
  @IsString()
  externalDriverName?: string;

  @IsOptional()
  @IsString()
  externalDriverPhone?: string;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsOptional()
  @IsString()
  supplierCarTypeId?: string;

  /** Which of the supplier's agreed cars of that type (1..quantity) — a Car Dispatch card. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  supplierCarNo?: number;

  @IsOptional()
  @IsBoolean()
  allowTypeMismatch?: boolean;
}
