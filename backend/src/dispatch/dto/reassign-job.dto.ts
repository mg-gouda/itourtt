import { IsOptional, IsUUID, ValidateIf } from 'class-validator';

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

  /** At least one field must be provided – validated in the service layer. */
  @ValidateIf((o) => !o.vehicleId && !o.driverId && !o.repId)
  _atLeastOne?: never;
}
