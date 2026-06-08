import {
  IsNotEmpty,
  IsString,
  IsEmail,
  IsInt,
  IsNumber,
  Min,
  IsOptional,
  IsIn,
  ValidateNested,
  IsArray,
  IsBoolean,
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

  // ── Precise pickup/drop-off point from the Google Places picker (optional) ──
  @IsString() @IsOptional() pickupPlaceId?: string;
  @IsNumber() @IsOptional() pickupLat?: number;
  @IsNumber() @IsOptional() pickupLng?: number;
  @IsString() @IsOptional() pickupAddress?: string;
  @IsString() @IsOptional() dropoffPlaceId?: string;
  @IsNumber() @IsOptional() dropoffLat?: number;
  @IsNumber() @IsOptional() dropoffLng?: number;
  @IsString() @IsOptional() dropoffAddress?: string;

  // ── 2-Way (return) transfer: when true, a second RETURN leg is created and
  //    these return-* fields describe the departure leg. ──
  @IsBoolean() @IsOptional() roundTrip?: boolean;
  @IsString() @IsOptional() returnDate?: string;
  @IsString() @IsOptional() returnPickupTime?: string;
  @IsString() @IsOptional() returnFlightNo?: string;
  @IsString() @IsOptional() returnCarrier?: string;
  @IsString() @IsOptional() returnTerminal?: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(['ONLINE', 'PAY_ON_ARRIVAL'])
  paymentMethod!: string;

  @IsString()
  @IsOptional()
  @IsIn(['STRIPE', 'EGYPT_BANK', 'DUBAI_BANK', 'GETPAYIN'])
  paymentGateway?: string;

  // Cloudflare Turnstile token. Only enforced when TURNSTILE_SECRET is set on
  // the backend (see CaptchaService) — keeps the field optional/inert otherwise.
  @IsString()
  @IsOptional()
  captchaToken?: string;
}
