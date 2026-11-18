import {
  BadRequestException, Body, Controller, Get, Post, Req, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { IsIn, IsNotEmpty, IsString } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../common/guards/permissions.guard.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { ApiResponse } from '../common/dto/api-response.dto.js';
import { B2bExcelImportService, type AliasKind } from './b2b-excel-import.service.js';

class SaveAliasDto {
  @IsIn(['CUSTOMER', 'SUPPLIER', 'DRIVER'])
  kind!: AliasKind;

  @IsString()
  @IsNotEmpty()
  rawName!: string;

  @IsString()
  @IsNotEmpty()
  targetId!: string;
}

const upload = FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function parseDates(raw: unknown): string[] {
  const list = String(raw ?? '').split(',').map((d) => d.trim()).filter(Boolean);
  for (const d of list) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new BadRequestException(`Invalid date "${d}"`);
  }
  return list;
}

/**
 * B2B "Import from Excel". Every endpoint takes the traffic sheet itself
 * (multipart `file`) so the server parses it — the preview and the commit read
 * the same bytes and the commit never trusts client-side matching.
 * Excluded from AuditInterceptor: the commit writes its own Activity Log rows
 * (one import summary + one per created/updated job).
 */
@Controller('traffic-jobs/b2b-excel-import')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions('traffic-jobs.b2b.importExcel')
export class B2bExcelImportController {
  constructor(private readonly service: B2bExcelImportService) {}

  /** `dates` empty → just the dates in the file with row counts. */
  @Post('preview')
  @UseInterceptors(upload)
  async preview(@UploadedFile() file: any, @Body('dates') dates: string) {
    if (!file?.buffer) throw new BadRequestException('Attach the Excel file');
    return new ApiResponse(await this.service.preview(file.buffer, parseDates(dates)));
  }

  @Post('commit')
  @UseInterceptors(upload)
  async commit(
    @UploadedFile() file: any,
    @Body('dates') dates: string,
    @Body('updateRowNos') updateRowNos: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('email') email: string,
    @Req() req: any,
  ) {
    if (!file?.buffer) throw new BadRequestException('Attach the Excel file');
    let rowNos: number[] = [];
    try {
      rowNos = updateRowNos ? (JSON.parse(updateRowNos) as unknown[]).map(Number).filter(Number.isInteger) : [];
    } catch {
      throw new BadRequestException('updateRowNos must be a JSON array of row numbers');
    }
    const fileName = String(file.originalname || 'traffic-sheet.xlsx');
    const result = await this.service.commit(file.buffer, fileName, parseDates(dates), rowNos, {
      id: userId,
      email,
      ip: req?.ip ?? null,
    });
    return new ApiResponse(result, `Imported: ${result.counts.created} created, ${result.counts.updated} updated`);
  }

  @Get('lookups')
  async lookups() {
    return new ApiResponse(await this.service.lookups());
  }

  @Post('aliases')
  async saveAlias(@Body() dto: SaveAliasDto, @CurrentUser('id') userId: string) {
    return new ApiResponse(await this.service.saveAlias(dto.kind, dto.rawName, dto.targetId, userId));
  }
}
