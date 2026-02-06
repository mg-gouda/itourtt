import {
  IsNotEmpty,
  IsUUID,
  IsNumber,
  IsPositive,
  IsOptional,
  IsString,
  IsDateString,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class InvoiceLineDto {
  @IsUUID()
  @IsNotEmpty()
  trafficJobId!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;
}

export class CreateInvoiceDto {
  @IsUUID()
  @IsNotEmpty()
  agentId!: string;

  @IsDateString()
  @IsNotEmpty()
  issueDate!: string;

  @IsDateString()
  @IsNotEmpty()
  dueDate!: string;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineDto)
  lines!: InvoiceLineDto[];
}
