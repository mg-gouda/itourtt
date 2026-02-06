import {
  IsUUID,
  IsNumber,
  IsOptional,
  IsDateString,
  IsArray,
  ValidateNested,
  Min,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum ServiceTypeEnum {
  ARR = 'ARR',
  DEP = 'DEP',
  EXCURSION = 'EXCURSION',
  ROUND_TRIP = 'ROUND_TRIP',
  ONE_WAY_GOING = 'ONE_WAY_GOING',
  ONE_WAY_RETURN = 'ONE_WAY_RETURN',
  OVER_DAY = 'OVER_DAY',
  TRANSFER = 'TRANSFER',
  CITY_TOUR = 'CITY_TOUR',
  COLLECTING_ONE_WAY = 'COLLECTING_ONE_WAY',
  COLLECTING_ROUND_TRIP = 'COLLECTING_ROUND_TRIP',
  EXPRESS_SHOPPING = 'EXPRESS_SHOPPING',
}

export class PriceItemDto {
  @IsEnum(ServiceTypeEnum)
  serviceType!: string;

  @IsUUID()
  fromZoneId!: string;

  @IsUUID()
  toZoneId!: string;

  @IsUUID()
  vehicleTypeId!: string;

  @IsNumber()
  @Min(0)
  transferPrice!: number;

  @IsNumber()
  @Min(0)
  driverTip!: number;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string;
}

export class BulkPriceListDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PriceItemDto)
  items!: PriceItemDto[];
}
