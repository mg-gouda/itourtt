import { IsOptional, IsDateString, IsIn, IsString } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto.js';

export class JobFilterDto extends PaginationDto {
  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsIn(['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW'])
  status?: 'PENDING' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

  @IsOptional()
  @IsString()
  agentId?: string;

  @IsOptional()
  @IsIn(['ARR', 'DEP', 'DAY_TOUR', 'ONE_WAY_TRANSFER', 'TWO_WAY_TRANSFER'])
  serviceType?: string;

  @IsOptional()
  @IsString()
  bookingChannel?: string;

  @IsOptional()
  @IsString()
  search?: string;
}
