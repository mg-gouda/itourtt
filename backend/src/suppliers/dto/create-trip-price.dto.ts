import {
  IsNotEmpty,
  IsUUID,
  IsNumber,
  IsOptional,
  IsString,
  IsDateString,
  Min,
} from 'class-validator';

export class CreateTripPriceDto {
  @IsNotEmpty()
  @IsUUID()
  fromZoneId!: string;

  @IsNotEmpty()
  @IsUUID()
  toZoneId!: string;

  @IsNotEmpty()
  @IsUUID()
  vehicleTypeId!: string;

  @IsNotEmpty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price!: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsNotEmpty()
  @IsDateString()
  effectiveFrom!: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string;
}
