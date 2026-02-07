import { IsOptional, IsDateString, IsUUID, IsIn, IsString } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto.js';

export class JobFilterDto extends PaginationDto {
  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsIn(['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'])
  status?: 'PENDING' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

  @IsOptional()
  @IsUUID()
  agentId?: string;

  @IsOptional()
  @IsIn(['ARR', 'DEP', 'EXCURSION', 'ROUND_TRIP', 'ONE_WAY_GOING', 'ONE_WAY_RETURN', 'OVER_DAY', 'TRANSFER', 'CITY_TOUR', 'COLLECTING_ONE_WAY', 'COLLECTING_ROUND_TRIP', 'EXPRESS_SHOPPING'])
  serviceType?: string;

  @IsOptional()
  @IsIn(['ONLINE', 'B2B'])
  bookingChannel?: 'ONLINE' | 'B2B';
}
