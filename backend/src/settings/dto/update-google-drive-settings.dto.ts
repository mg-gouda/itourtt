import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateGoogleDriveSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  serviceAccountJson?: string;

  @IsOptional()
  @IsString()
  rootFolderId?: string;
}
