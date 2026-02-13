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

export class AgentPriceItemDto {
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
  price!: number;

  @IsNumber()
  @Min(0)
  driverTip!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  boosterSeatPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  babySeatPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  wheelChairPrice?: number;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string;
}

export class BulkAgentPriceListDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AgentPriceItemDto)
  items!: AgentPriceItemDto[];
}
