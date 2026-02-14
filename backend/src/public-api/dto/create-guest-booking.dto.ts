import {
  IsNotEmpty,
  IsString,
  IsEmail,
  IsUUID,
  IsInt,
  Min,
  IsOptional,
  IsIn,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

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

  @IsUUID()
  @IsNotEmpty()
  fromZoneId!: string;

  @IsUUID()
  @IsNotEmpty()
  toZoneId!: string;

  @IsUUID()
  @IsOptional()
  hotelId?: string;

  @IsUUID()
  @IsOptional()
  originAirportId?: string;

  @IsUUID()
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

  @IsUUID()
  @IsNotEmpty()
  vehicleTypeId!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => BookingExtrasDto)
  extras?: BookingExtrasDto;

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
