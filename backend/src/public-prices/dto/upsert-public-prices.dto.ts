import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsArray,
  ValidateNested,
  IsUUID,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PublicPriceItemDto {
  @IsString()
  @IsNotEmpty()
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
  @IsOptional()
  driverTip?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  boosterSeatPrice?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  babySeatPrice?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  wheelChairPrice?: number;

  @IsString()
  @IsOptional()
  currency?: string;
}

export class UpsertPublicPricesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PublicPriceItemDto)
  items!: PublicPriceItemDto[];
}
