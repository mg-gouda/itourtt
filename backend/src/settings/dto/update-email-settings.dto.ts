import { IsOptional, IsString, IsInt, IsBoolean, IsEmail, Min, Max } from 'class-validator';

export class UpdateEmailSettingsDto {
  @IsOptional()
  @IsString()
  smtpHost?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  smtpPort?: number;

  @IsOptional()
  @IsBoolean()
  smtpSecure?: boolean;

  @IsOptional()
  @IsString()
  smtpUser?: string;

  @IsOptional()
  @IsString()
  smtpPass?: string;

  @IsOptional()
  @IsString()
  fromAddress?: string;

  @IsOptional()
  @IsString()
  notifyDispatchEmail?: string;

  @IsOptional()
  @IsString()
  notifyTrafficEmail?: string;
}
