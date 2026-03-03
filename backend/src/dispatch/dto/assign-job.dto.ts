import { IsNotEmpty, IsOptional, IsString, IsBoolean } from 'class-validator';

export class AssignJobDto {
  @IsNotEmpty()
  @IsString()
  trafficJobId!: string;

  @IsNotEmpty()
  @IsString()
  vehicleId!: string;

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
  @IsBoolean()
  allowTypeMismatch?: boolean;
}
