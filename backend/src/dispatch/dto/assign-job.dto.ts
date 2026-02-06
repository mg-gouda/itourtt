import { IsNotEmpty, IsOptional, IsUUID } from 'class-validator';

export class AssignJobDto {
  @IsNotEmpty()
  @IsUUID()
  trafficJobId!: string;

  @IsNotEmpty()
  @IsUUID()
  vehicleId!: string;

  @IsOptional()
  @IsUUID()
  driverId?: string;

  @IsOptional()
  @IsUUID()
  repId?: string;
}
