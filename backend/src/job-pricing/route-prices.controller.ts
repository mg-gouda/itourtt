import {
  BadRequestException, Body, Controller, Get, Param, Post, Put, Query, Res, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { Type } from 'class-transformer';
import { IsArray, IsNotEmpty, IsNumber, IsString, ValidateIf, ValidateNested } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../common/guards/permissions.guard.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';
import { ApiResponse } from '../common/dto/api-response.dto.js';
import { RoutePricesService } from './route-prices.service.js';

class CellDto {
  @IsString() @IsNotEmpty() jobServiceTypeId!: string;
  @IsString() @IsNotEmpty() vehicleTypeId!: string;
  @ValidateIf((_, v) => v !== null) @IsNumber() price!: number | null;
}
class CellsDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => CellDto) cells!: CellDto[];
}

const upload = FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const xlsx = (res: Response, buf: Buffer, name: string) => {
  res.set({
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="${name}"`,
    'Content-Length': buf.length.toString(),
  });
  res.end(buf);
};

/** Customer route prices (per customer) and the global driver-tip table. Reuses the customer price-list permission keys. */
@Controller('route-prices')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RoutePricesController {
  constructor(private readonly service: RoutePricesService) {}

  @Get('customers/export')
  @Permissions('customers.detail.priceList.downloadTemplate', 'customers.detail.priceList')
  async exportCustomers(@Res() res: Response, @Query('customerId') customerId?: string) {
    // ?customerId= → that customer only (the customer page's "Export customer price list").
    if (customerId && !/^[0-9a-f-]{36}$/i.test(customerId)) throw new BadRequestException('Invalid customerId');
    xlsx(res, await this.service.exportCustomerPrices(customerId), 'customer-prices.xlsx');
  }

  @Post('customers/import')
  @Permissions('customers.detail.priceList.import')
  @UseInterceptors(upload)
  async importCustomers(@UploadedFile() file: any) {
    if (!file?.buffer) throw new BadRequestException('Attach the Excel file');
    return new ApiResponse(await this.service.importCustomerPrices(file.buffer));
  }

  @Get('customers/:id')
  @Permissions('customers.detail.priceList')
  async customerGrid(@Param('id') id: string) {
    return new ApiResponse(await this.service.customerGrid(id));
  }

  @Put('customers/:id')
  @Permissions('customers.detail.priceList.editPrice')
  async saveCustomer(@Param('id') id: string, @Body() dto: CellsDto) {
    return new ApiResponse(await this.service.saveCustomerCells(id, dto.cells));
  }


}
