import { IsIn, IsOptional } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto.js';

/**
 * GET /suppliers — page / limit plus the Active / Inactive tab filter. The tabs send
 * isActive=true|false; with only PaginationDto the strict query validation refused it (400).
 */
export class SupplierListQueryDto extends PaginationDto {
  @IsOptional()
  @IsIn(['true', 'false'])
  isActive?: string;
}
