import {
  BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Put, Res, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, ValidateIf, ValidateNested } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../common/guards/permissions.guard.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { ApiResponse } from '../common/dto/api-response.dto.js';
import { SupplierPriceListsService } from './supplier-price-lists.service.js';

class UpsertPriceListDto {
  @IsOptional() @IsString() @IsNotEmpty() name?: string;
  /** YYYY-MM-DD. */
  @IsOptional() @IsString() validFrom?: string;
  /** YYYY-MM-DD; null / empty = until changed. */
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() validTo?: string | null;
  @IsOptional() @IsBoolean() isDefaultForNew?: boolean;
  @IsOptional() @IsBoolean() isOwnCarList?: boolean;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() notes?: string | null;
}

class PriceCellDto {
  @IsString() @IsNotEmpty() jobServiceTypeId!: string;
  @IsString() @IsNotEmpty() vehicleTypeId!: string;
  @ValidateIf((_, v) => v !== null) @IsNumber() price!: number | null;
}

class MoveSuppliersDto {
  @IsArray() @IsString({ each: true }) supplierIds!: string[];
  @ValidateIf((_, v) => v !== null) @IsString() priceListId!: string | null;
  /** YYYY-MM-DD — may be in the past (jobs from then on are re-costed). */
  @IsString() @IsNotEmpty() from!: string;
}
class SavePricesDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => PriceCellDto) cells!: PriceCellDto[];
}

/** Supplier price lists (List A, B, C…): route × car-type prices; suppliers are assigned to one. */
@Controller('supplier-price-lists')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SupplierPriceListsController {
  constructor(private readonly service: SupplierPriceListsService) {}

  @Get()
  @Permissions('supplier-price-lists', 'suppliers')
  async findAll() {
    return new ApiResponse(await this.service.findAll());
  }

  /** Ended lists still pricing suppliers (or own cars). */
  @Get('alerts')
  @Permissions('supplier-price-lists', 'supplier-price-lists.alerts')
  async alerts() {
    return new ApiResponse(await this.service.alerts());
  }

  /** One supplier's dated list history. */
  @Get('history/:supplierId')
  @Permissions('supplier-price-lists', 'suppliers')
  async history(@Param('supplierId') supplierId: string) {
    return new ApiResponse(await this.service.history(supplierId));
  }

  /** Put suppliers on a list from a date (backdating re-costs their jobs; posted costs reported). */
  @Post('move')
  @Permissions('supplier-price-lists.edit', 'suppliers.table.editButton')
  async move(@Body() dto: MoveSuppliersDto, @CurrentUser('id') userId: string) {
    return new ApiResponse(await this.service.moveSuppliers(dto, userId));
  }

  @Get('export')
  @Permissions('supplier-price-lists')
  async export(@Res() res: Response) {
    const buf = await this.service.exportWorkbook();
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="supplier-price-lists.xlsx"',
      'Content-Length': buf.length.toString(),
    });
    res.end(buf);
  }

  @Post('import')
  @Permissions('supplier-price-lists.edit')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }))
  async import(@UploadedFile() file: any) {
    if (!file?.buffer) throw new BadRequestException('Attach the Excel file');
    return new ApiResponse(await this.service.importWorkbook(file.buffer));
  }

  @Post()
  @Permissions('supplier-price-lists.edit')
  async create(@Body() dto: UpsertPriceListDto) {
    if (!dto.name) throw new BadRequestException('Name is required');
    return new ApiResponse(await this.service.create({ ...dto, name: dto.name, notes: dto.notes ?? undefined }));
  }

  @Get(':id/grid')
  @Permissions('supplier-price-lists')
  async grid(@Param('id') id: string) {
    return new ApiResponse(await this.service.grid(id));
  }

  @Put(':id/prices')
  @Permissions('supplier-price-lists.edit')
  async savePrices(@Param('id') id: string, @Body() dto: SavePricesDto) {
    return new ApiResponse(await this.service.saveCells(id, dto.cells));
  }

  @Patch(':id')
  @Permissions('supplier-price-lists.edit')
  async update(@Param('id') id: string, @Body() dto: UpsertPriceListDto) {
    return new ApiResponse(await this.service.update(id, dto));
  }

  @Delete(':id')
  @Permissions('supplier-price-lists.edit')
  async remove(@Param('id') id: string) {
    return new ApiResponse(await this.service.remove(id));
  }
}
