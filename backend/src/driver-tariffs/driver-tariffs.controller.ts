import { Body, Controller, Get, Post, Put, Res, UploadedFile, UseGuards, UseInterceptors, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../common/guards/permissions.guard.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';
import { ApiResponse } from '../common/dto/api-response.dto.js';
import { DriverTariffsService } from './driver-tariffs.service.js';
import type { RouteRateCell } from '../job-pricing/route-rate-table.js';

/** Driver tariffs: one route × car-type grid (System Parameters › Driver Tariffs). */
@Controller('driver-tariffs')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DriverTariffsController {
  constructor(private readonly service: DriverTariffsService) {}

  @Get('grid')
  @Permissions('driver-tariffs')
  async grid() {
    return new ApiResponse(await this.service.grid());
  }

  @Put('grid')
  @Permissions('driver-tariffs.upsert')
  async save(@Body() body: { cells: RouteRateCell[] }) {
    if (!Array.isArray(body?.cells)) throw new BadRequestException('cells is required');
    return new ApiResponse(await this.service.saveCells(body.cells), 'Driver tariffs saved');
  }

  @Get('export')
  @Permissions('driver-tariffs')
  async export(@Res() res: Response) {
    const buffer = await this.service.exportSheet();
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="driver-tariffs.xlsx"',
      'Content-Length': buffer.length.toString(),
    });
    res.end(buffer);
  }

  @Post('import')
  @Permissions('driver-tariffs.upsert')
  @UseInterceptors(FileInterceptor('file'))
  async import(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    return new ApiResponse(await this.service.importSheet(file.buffer), 'Driver tariffs imported');
  }
}
