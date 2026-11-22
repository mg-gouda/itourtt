import { IsOptional, IsString, IsBoolean, IsInt, Min, Max, ValidateIf } from 'class-validator';

export class ReassignJobDto {
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

  /** Which of the supplier's agreed cars of that type (1..quantity) — a Traffic Cover card. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  supplierCarNo?: number;

  @IsOptional()
  @IsBoolean()
  allowTypeMismatch?: boolean;

  /** At least one field must be provided – validated in the service layer. */
  @ValidateIf((o) => !o.vehicleId && !o.driverId && !o.repId && !o.externalDriverName && !o.remarks && !o.supplierCarTypeId)
  _atLeastOne?: never;
}
