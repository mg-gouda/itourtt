import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Rep/driver status geofence radii in metres. 50 m floor (GPS accuracy alone
 * can be that bad) and 50 km ceiling (anything wider is a typo, not a fence).
 */
export class UpdateGeofenceSettingsDto {
  @IsOptional()
  @IsInt()
  @Min(50)
  @Max(50_000)
  airportMeters?: number;

  @IsOptional()
  @IsInt()
  @Min(50)
  @Max(50_000)
  otherMeters?: number;
}
