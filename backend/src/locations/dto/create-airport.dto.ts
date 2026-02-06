import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateAirportDto {
  @IsNotEmpty()
  @IsString()
  name!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(10)
  code!: string;

  @IsNotEmpty()
  @IsUUID()
  countryId!: string;
}
