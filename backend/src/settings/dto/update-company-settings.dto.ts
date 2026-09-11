import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator';

export class UpdateCompanySettingsDto {
  @IsOptional()
  @IsString()
  companyName?: string;

  @IsOptional()
  @IsString()
  reportHeaderHtml?: string;

  @IsOptional()
  @IsString()
  reportFooterHtml?: string;

  @IsOptional()
  @IsString()
  licenseKey?: string;

  @IsOptional()
  @IsString()
  systemNotificationEmail?: string;

  /**
   * The NO SHOW wait in minutes, for every agent that has no override of its
   * own. Capped at 12 hours: anything longer is a typo, and it would leave a
   * driver unable to close the job at all.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(720)
  noShowWaitStandardMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(720)
  noShowWaitDepMinutes?: number;
}
