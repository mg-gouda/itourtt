import { IsNotEmpty, IsString, IsUUID, IsOptional, IsIn } from 'class-validator';

export class CreateVehicleDto {
  @IsNotEmpty()
  @IsString()
  plateNumber!: string;

  @IsNotEmpty()
  @IsUUID()
  vehicleTypeId!: string;

  @IsOptional()
  @IsIn(['OWNED', 'RENTED', 'CONTRACTED'])
  ownership?: 'OWNED' | 'RENTED' | 'CONTRACTED';
}
