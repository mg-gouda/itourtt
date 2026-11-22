import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, ValidateIf } from 'class-validator';

export const RMF_SECTIONS = ['NORTH', 'SOUTH', 'DEEP_SOUTH'] as const;
export const RMF_ROUTE_AREAS = ['NORTH-MARSA ALAM', 'SOUTH MARSA ALAM', 'SHAMS ALAM', 'WADI LAHMI'] as const;

/** System Parameters › Routes › RMF Hotels: one Marsa Alam hotel (see model RmfHotel). */
export class RmfHotelDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsIn(RMF_SECTIONS as unknown as string[])
  section: (typeof RMF_SECTIONS)[number];

  /** Defaults from the section when left out. */
  @IsOptional()
  @IsIn(RMF_ROUTE_AREAS as unknown as string[])
  routeArea?: string;

  /** Defaults to the hotel name when left out. */
  @IsOptional()
  @IsString()
  matchWords?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  excludeWords?: string | null;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
