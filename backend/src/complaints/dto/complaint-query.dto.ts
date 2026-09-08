import { IsOptional, IsString, IsUUID, IsIn, IsDateString } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto.js';
import {
  COMPLAINT_STAGES,
  COMPLAINT_SOURCES,
  COMPLAINT_STATUSES,
  COMPLAINT_PARTIES,
} from './complaint-constants.js';

// The global pipe runs with forbidNonWhitelisted, so every filter the UI sends
// must be declared here or the request 400s.
export class ComplaintQueryDto extends PaginationDto {
  @IsOptional()
  @IsIn(COMPLAINT_STATUSES)
  status?: (typeof COMPLAINT_STATUSES)[number];

  @IsOptional()
  @IsIn(COMPLAINT_STAGES)
  stage?: (typeof COMPLAINT_STAGES)[number];

  @IsOptional()
  @IsIn(COMPLAINT_SOURCES)
  source?: (typeof COMPLAINT_SOURCES)[number];

  @IsOptional()
  @IsIn(COMPLAINT_PARTIES)
  responsibleParty?: (typeof COMPLAINT_PARTIES)[number];

  @IsOptional()
  @IsUUID()
  agentId?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID()
  trafficJobId?: string;

  @IsOptional()
  @IsUUID()
  responsibleDriverId?: string;

  @IsOptional()
  @IsUUID()
  responsibleRepId?: string;

  @IsOptional()
  @IsUUID()
  responsibleSupplierId?: string;

  @IsOptional()
  @IsUUID()
  assignedToId?: string;

  /** 'true' → only breached, 'false' → only within SLA. Omitted → both. */
  @IsOptional()
  @IsIn(['true', 'false'])
  slaBreached?: string;

  /** 'true' → only complaints not yet in a terminal state. */
  @IsOptional()
  @IsIn(['true', 'false'])
  openOnly?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(['complaintDate', 'replyDueAt', 'createdAt', 'status', 'lossAmount'])
  sortBy?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}
