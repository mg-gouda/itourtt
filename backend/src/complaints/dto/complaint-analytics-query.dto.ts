import { IsOptional, IsUUID, IsDateString, IsIn } from 'class-validator';
import { COMPLAINT_PARTIES } from './complaint-constants.js';

/**
 * Filters for the analytics screen. Everything is optional: with no range the
 * service falls back to the last 90 days, which is what the page opens on.
 */
export class ComplaintAnalyticsQueryDto {
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsUUID()
  agentId?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsIn(COMPLAINT_PARTIES)
  responsibleParty?: (typeof COMPLAINT_PARTIES)[number];
}
