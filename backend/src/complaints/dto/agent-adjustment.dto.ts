import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto.js';

export const AGENT_ADJUSTMENT_STATUSES = [
  'PENDING',
  'ON_INVOICE',
  'ISSUED_CREDIT_NOTE',
  'WAIVED',
] as const;

export class AgentAdjustmentQueryDto extends PaginationDto {
  @IsOptional()
  @IsIn(AGENT_ADJUSTMENT_STATUSES)
  status?: (typeof AGENT_ADJUSTMENT_STATUSES)[number];

  @IsOptional()
  @IsUUID()
  agentId?: string;

  @IsOptional()
  @IsUUID()
  complaintId?: string;

  @IsOptional()
  @IsString()
  search?: string;
}

/**
 * The three things finance can do with a pending adjustment. ON_INVOICE is
 * reached by putting the adjustment on a draft invoice, not through this DTO.
 */
export class AdjustmentDispositionDto {
  @IsIn(['CREDIT_NOTE', 'WAIVE'])
  disposition!: 'CREDIT_NOTE' | 'WAIVE';

  /** Required when waiving — why we are writing this off without paying it. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  /** Credit-note date; defaults to today in Cairo. */
  @IsOptional()
  @IsString()
  invoiceDate?: string;
}

export class AttachAdjustmentDto {
  @IsNotEmpty()
  @IsUUID()
  invoiceId!: string;
}
