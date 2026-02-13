import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateWhatsappSettingsDto {
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsString()
  twilioAccountSid?: string;

  @IsOptional()
  @IsString()
  twilioAuthToken?: string;

  @IsOptional()
  @IsString()
  whatsappFrom?: string;

  @IsOptional()
  @IsString()
  messageTemplate?: string;

  @IsOptional()
  @IsString()
  mediaUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  sendHour?: number;
}
