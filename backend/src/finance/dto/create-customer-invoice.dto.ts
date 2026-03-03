import {
  IsString,
  IsArray,
  IsDateString,
  IsOptional,
  IsEnum,
} from 'class-validator';

export class GenerateCustomerInvoicesDto {
  @IsString()
  customerId!: string;

  @IsArray()
  @IsString({ each: true })
  trafficJobIds!: string[];

  @IsDateString()
  issueDate!: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}
