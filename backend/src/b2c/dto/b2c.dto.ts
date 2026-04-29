import { IsEmail, IsString, IsNotEmpty, IsInt, Min, IsOptional } from 'class-validator';

export class B2CLoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  phone!: string;
}

export class B2CChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @IsString()
  @IsNotEmpty()
  newPassword!: string;
}

export class B2CAmendBookingDto {
  @IsOptional()
  @IsString()
  jobDate?: string;

  @IsOptional()
  @IsString()
  pickupTime?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  paxCount?: number;
}
