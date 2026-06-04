import { IsNotEmpty, IsString, IsInt, Min, Max } from 'class-validator';

/**
 * Validated body for POST /public/vehicle-quotes. Previously this endpoint
 * used an inline `@Body() body: {...}` object, which the global ValidationPipe
 * (whitelist + forbidNonWhitelisted) cannot inspect — letting unvalidated input
 * reach the service. A concrete DTO closes that gap.
 */
export class VehicleQuotesRequestDto {
  @IsString()
  @IsNotEmpty()
  serviceType!: string;

  @IsString()
  @IsNotEmpty()
  fromZoneId!: string;

  @IsString()
  @IsNotEmpty()
  toZoneId!: string;

  @IsInt()
  @Min(1)
  @Max(100)
  paxCount!: number;
}
