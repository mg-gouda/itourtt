import {
  IsNotEmpty,
  IsString,
  IsInt,
  Min,
  IsOptional,
  ValidateNested,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CustomExtraSelectionDto } from './custom-extra-selection.dto.js';

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

  @IsString()
  @IsNotEmpty()
  fromZoneId!: string;

  @IsString()
  @IsNotEmpty()
  toZoneId!: string;

  @IsString()
  @IsNotEmpty()
  vehicleTypeId!: string;

  @IsInt()
  @Min(1)
  paxCount!: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => ExtrasDto)
  extras?: ExtrasDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomExtraSelectionDto)
  customExtras?: CustomExtraSelectionDto[];
}
