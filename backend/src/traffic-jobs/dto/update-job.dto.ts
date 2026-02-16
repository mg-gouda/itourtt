import {
  IsOptional, IsString, IsUUID, IsDateString,
  IsInt, IsIn, IsBoolean, IsNumber, Min, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { FlightInfoDto } from './create-job.dto.js';

export class UpdateJobDto {
  @IsOptional()
  @IsIn(['NEW', 'UPDATED', 'CANCELLED'])
  bookingStatus?: 'NEW' | 'UPDATED' | 'CANCELLED';

  @IsOptional()
  @IsUUID()
  agentId?: string;

  @IsOptional()
  @IsString()
  agentRef?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsIn(['ARR', 'DEP', 'EXCURSION', 'ROUND_TRIP', 'ONE_WAY_GOING', 'ONE_WAY_RETURN', 'OVER_DAY', 'TRANSFER', 'CITY_TOUR', 'COLLECTING_ONE_WAY', 'COLLECTING_ROUND_TRIP', 'EXPRESS_SHOPPING'])
  serviceType?: string;

  @IsOptional()
  @IsDateString()
  jobDate?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  adultCount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  childCount?: number;

  @IsOptional()
  @IsUUID()
  originAirportId?: string;

  @IsOptional()
  @IsUUID()
  originZoneId?: string;

  @IsOptional()
  @IsUUID()
  originHotelId?: string;

  @IsOptional()
  @IsUUID()
  destinationAirportId?: string;

  @IsOptional()
  @IsUUID()
  destinationZoneId?: string;

  @IsOptional()
  @IsUUID()
  destinationHotelId?: string;

  @IsOptional()
  @IsString()
  clientName?: string;

  @IsOptional()
  @IsString()
  clientMobile?: string;

  @IsOptional()
  @IsBoolean()
  boosterSeat?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  boosterSeatQty?: number;

  @IsOptional()
  @IsBoolean()
  babySeat?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  babySeatQty?: number;

  @IsOptional()
  @IsBoolean()
  wheelChair?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  wheelChairQty?: number;

  @IsOptional()
  @IsBoolean()
  printSign?: boolean;

  @IsOptional()
  @IsDateString()
  pickUpTime?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  collectionRequired?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  collectionAmount?: number;

  @IsOptional()
  @IsIn(['EGP', 'USD', 'EUR'])
  collectionCurrency?: string;

  @IsOptional()
  @IsString()
  custRepName?: string;

  @IsOptional()
  @IsString()
  custRepMobile?: string;

  @IsOptional()
  @IsString()
  custRepMeetingPoint?: string;

  @IsOptional()
  @IsDateString()
  custRepMeetingTime?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => FlightInfoDto)
  flight?: FlightInfoDto;
}
