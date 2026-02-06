import {
  IsNotEmpty,
  IsUUID,
  IsNumber,
  IsPositive,
  IsOptional,
  IsString,
  IsDateString,
  IsIn,
} from 'class-validator';

export class CreatePaymentDto {
  @IsUUID()
  @IsNotEmpty()
  agentInvoiceId!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsDateString()
  @IsNotEmpty()
  paymentDate!: string;

  @IsString()
  @IsIn(['CASH', 'BANK_TRANSFER', 'CHECK'])
  method!: string;

  @IsString()
  @IsOptional()
  reference?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
