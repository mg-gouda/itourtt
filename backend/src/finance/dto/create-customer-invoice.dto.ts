import {
  IsUUID,
  IsArray,
  IsDateString,
  IsOptional,
  IsEnum,
} from 'class-validator';

export class GenerateCustomerInvoicesDto {
  @IsUUID()
  customerId!: string;

  @IsArray()
  @IsUUID(undefined, { each: true })
  trafficJobIds!: string[];

  @IsDateString()
  issueDate!: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}
