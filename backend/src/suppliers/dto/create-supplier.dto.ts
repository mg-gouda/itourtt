import {
  ValidateIf,
  IsNotEmpty,
  IsString,
  IsOptional,
  IsEmail,
  IsIn,
} from 'class-validator';

export class CreateSupplierDto {
  @IsOptional()
  @IsIn(['COMPANY', 'INDIVIDUAL'])
  supplierType?: 'COMPANY' | 'INDIVIDUAL';

  @IsNotEmpty()
  @IsString()
  legalName!: string;

  @IsOptional()
  @IsString()
  tradeName?: string;

  @IsOptional()
  @IsString()
  taxId?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  // Individual supplier fields
  @IsOptional()
  @IsString()
  mobileNumber?: string;

  @IsOptional()
  @IsString()
  nationalIdImage?: string;

  /** Supplier price list (SupplierPriceList). Omitted on create → the list
   *  flagged isDefaultForNew; null on update → no list (no automatic cost). */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  priceListId?: string | null;
}
