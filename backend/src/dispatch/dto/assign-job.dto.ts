import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

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

  @IsOptional()
  @IsString()
  externalDriverName?: string;

  @IsOptional()
  @IsString()
  externalDriverPhone?: string;

  @IsOptional()
  @IsString()
  remarks?: string;
}
