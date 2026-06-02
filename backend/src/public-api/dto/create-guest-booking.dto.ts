import {
  IsNotEmpty,
  IsString,
  IsEmail,
  IsInt,
  Min,
  IsOptional,
  IsIn,
  ValidateNested,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CustomExtraSelectionDto } from './custom-extra-selection.dto.js';

export class BookingExtrasDto {
  @IsInt()
  @Min(0)
  @IsOptional()
  boosterSeatQty?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  babySeatQty?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  wheelChairQty?: number;
}

export class CreateGuestBookingDto {
  @IsString()
  @IsNotEmpty()
  guestName!: string;

  @IsEmail()
  @IsNotEmpty()
  guestEmail!: string;

  @IsString()
  @IsNotEmpty()
  guestPhone!: string;

  @IsString()
  @IsOptional()
  guestCountry?: string;

  @IsString()
  @IsNotEmpty()
  serviceType!: string;

  @IsString()
  @IsNotEmpty()
  jobDate!: string;

  @IsString()
  @IsOptional()
  pickupTime?: string;

  @IsString()
  @IsNotEmpty()
  fromZoneId!: string;

  @IsString()
  @IsNotEmpty()
  toZoneId!: string;

  @IsString()
  @IsOptional()
  hotelId?: string;

  @IsString()
  @IsOptional()
  originAirportId?: string;

  @IsString()
  @IsOptional()
  destinationAirportId?: string;

  @IsString()
  @IsOptional()
  flightNo?: string;

  @IsString()
  @IsOptional()
  carrier?: string;

  @IsString()
  @IsOptional()
  terminal?: string;

  @IsInt()
  @Min(1)
  paxCount!: number;

  @IsString()
  @IsNotEmpty()
  vehicleTypeId!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => BookingExtrasDto)
  extras?: BookingExtrasDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomExtraSelectionDto)
  customExtras?: CustomExtraSelectionDto[];

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(['ONLINE', 'PAY_ON_ARRIVAL'])
  paymentMethod!: string;

  @IsString()
  @IsOptional()
  @IsIn(['STRIPE', 'EGYPT_BANK', 'DUBAI_BANK'])
  paymentGateway?: string;
}
