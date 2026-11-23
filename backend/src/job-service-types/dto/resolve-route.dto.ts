import { IsDateString, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

const SERVICE_TYPES = ['ARR', 'DEP', 'DAY_TOUR', 'ONE_WAY_TRANSFER', 'TWO_WAY_TRANSFER', 'RETURN'];

/** GET /job-service-types/resolve — a job's ends (+ notes) to look the route up by. */
export class ResolveRouteQueryDto {
  @IsIn(SERVICE_TYPES)
  serviceType!: string;

  @IsOptional() @IsUUID() originAirportId?: string;
  @IsOptional() @IsUUID() originZoneId?: string;
  @IsOptional() @IsUUID() originHotelId?: string;
  @IsOptional() @IsUUID() destinationAirportId?: string;
  @IsOptional() @IsUUID() destinationZoneId?: string;
  @IsOptional() @IsUUID() destinationHotelId?: string;
  @IsOptional() @IsString() notes?: string;
}

/** POST /job-service-types/resolve/backfill — fill routes on online / B2C jobs from this date on. */
export class RouteBackfillDto {
  @IsDateString()
  fromDate!: string;
}
