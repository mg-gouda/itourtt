import { IsNotEmpty, IsString, Length } from 'class-validator';

export class CreateCountryDto {
  @IsNotEmpty()
  @IsString()
  name!: string;

  @IsNotEmpty()
  @IsString()
  @Length(2, 3)
  code!: string;
}
