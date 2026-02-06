import { IsNotEmpty, IsString, IsInt, Min } from 'class-validator';

export class CreateVehicleTypeDto {
  @IsNotEmpty()
  @IsString()
  name!: string;

  @IsNotEmpty()
  @IsInt()
  @Min(1)
  seatCapacity!: number;
}
