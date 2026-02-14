import {
  IsNotEmpty,
  IsString,
  IsUUID,
  IsInt,
  Min,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ExtrasDto {
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

export class QuoteRequestDto {
  @IsString()
  @IsNotEmpty()
  serviceType!: string;

  @IsUUID()
  @IsNotEmpty()
  fromZoneId!: string;

  @IsUUID()
  @IsNotEmpty()
  toZoneId!: string;

  @IsUUID()
  @IsNotEmpty()
  vehicleTypeId!: string;

  @IsInt()
  @Min(1)
  paxCount!: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => ExtrasDto)
  extras?: ExtrasDto;
}
