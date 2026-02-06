import { IsNotEmpty, IsString, IsUUID, IsOptional, IsInt, Min, Max } from 'class-validator';

export class CreateHotelDto {
  @IsNotEmpty()
  @IsString()
  name!: string;

  @IsNotEmpty()
  @IsUUID()
  zoneId!: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  stars?: number;
}
