import { IsIn, IsOptional, IsString, Matches } from 'class-validator';

const UPLOAD_PATH = /^\/uploads\/[\w.\-]+$/;

export class UpdateSystemSettingsDto {
  @IsOptional()
  @IsString()
  @IsIn(['light', 'dark'])
  theme?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'primaryColor must be a valid hex color (e.g. #3b82f6)' })
  primaryColor?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'accentColor must be a valid hex color (e.g. #8b5cf6)' })
  accentColor?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'sidebarColor must be a valid hex color (e.g. #41004c)' })
  sidebarColor?: string;

  @IsOptional()
  @IsString()
  fontFamily?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  googleMapsApiKey?: string;

  // Styling images. Uploads go through their own POST endpoints; here they can
  // only be cleared (null) or set back to an already-uploaded /uploads/ file.
  @IsOptional()
  @IsString()
  @Matches(UPLOAD_PATH, { message: 'innerBgImageUrl must be null or an /uploads/ path' })
  innerBgImageUrl?: string | null;

  @IsOptional()
  @IsString()
  @Matches(UPLOAD_PATH, { message: 'loginBgImageUrl must be null or an /uploads/ path' })
  loginBgImageUrl?: string | null;

  @IsOptional()
  @IsString()
  @Matches(UPLOAD_PATH, { message: 'loginLogoUrl must be null or an /uploads/ path' })
  loginLogoUrl?: string | null;
}
