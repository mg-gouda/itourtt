import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsIn, ValidateIf } from 'class-validator';
import { SELECTABLE_SERVICE_TYPES } from '../../common/utils/service-type.util.js';

export class CreateJobServiceTypeDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  fromZoneId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  toZoneId?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** Route defaults used by the B2B Excel import. null clears. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsIn([...SELECTABLE_SERVICE_TYPES])
  defaultServiceType?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  fromAirportId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  toAirportId?: string | null;
}
