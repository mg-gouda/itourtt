import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class CreateZoneDto {
  @IsNotEmpty()
  @IsString()
  name!: string;

  @IsNotEmpty()
  @IsUUID()
  cityId!: string;
}
