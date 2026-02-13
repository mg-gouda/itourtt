import { IsOptional, IsString, IsUUID, IsDateString } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto.js';

export class QueryActivityLogDto extends PaginationDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsString()
  entity?: string;

  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsString()
  search?: string;
}
