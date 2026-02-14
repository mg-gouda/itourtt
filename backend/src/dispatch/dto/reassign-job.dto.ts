import { IsOptional, IsString, IsUUID, ValidateIf } from 'class-validator';

export class ReassignJobDto {
  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @IsOptional()
  @IsUUID()
  driverId?: string;

  @IsOptional()
  @IsUUID()
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

  /** At least one field must be provided – validated in the service layer. */
  @ValidateIf((o) => !o.vehicleId && !o.driverId && !o.repId && !o.externalDriverName && !o.remarks)
  _atLeastOne?: never;
}
