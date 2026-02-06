import { IsUUID, IsOptional, IsBoolean } from 'class-validator';

export class AssignVehicleDto {
  @IsUUID()
  vehicleId!: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
