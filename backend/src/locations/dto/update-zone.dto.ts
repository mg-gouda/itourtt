import { IsOptional, IsString, IsNumber, IsUUID } from 'class-validator';

export class UpdateZoneDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  cityId?: string;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @IsString()
  placeId?: string;

  /** "Counts as (for routes)": another zone whose routes this zone uses; null clears it. */
  @IsOptional()
  @IsUUID()
  routeZoneId?: string | null;
}
