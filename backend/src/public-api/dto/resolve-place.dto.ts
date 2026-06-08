import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

// A Google Places pick from the B2C booking widget. The backend maps it to a
// pricing zone (and a hotel), auto-creating the hotel under the nearest zone
// when it isn't already in the location tree.
export class ResolvePlaceDto {
  @IsString()
  @IsNotEmpty()
  placeId!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsNumber()
  lat!: number;

  @IsNumber()
  lng!: number;

  @IsString()
  @IsOptional()
  address?: string;

  // Scope the nearest-zone search to this airport's cities (the airport the
  // guest selected on the ARR/DEP tab). Omitted for city-to-city.
  @IsString()
  @IsOptional()
  airportId?: string;
}
