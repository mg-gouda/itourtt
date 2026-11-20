import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query, Res, UseGuards } from '@nestjs/common';
import * as express from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { PermissionsGuard } from '../common/guards/permissions.guard.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { ApiResponse } from '../common/dto/api-response.dto.js';
import { TripKmService } from './trip-km.service.js';

/** Trip kilometres (odometer readings at job completion) — office side. */
@Controller('trip-km')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class TripKmController {
  constructor(private readonly tripKm: TripKmService) {}

  /** GET /trip-km?from=&to=&vehicleId=&driverId=&flagged=1 */
  @Get()
  @Permissions('trip-km')
  async list(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('vehicleId') vehicleId?: string,
    @Query('driverId') driverId?: string,
    @Query('flagged') flagged?: string,
  ) {
    return new ApiResponse(await this.tripKm.list({ from, to, vehicleId, driverId, flaggedOnly: flagged === '1' || flagged === 'true' }));
  }

  /** GET /trip-km/summary?date= — the morning reminder (default: yesterday, Cairo). */
  @Get('summary')
  @Permissions('trip-km')
  async summary(@Query('date') date?: string) {
    return new ApiResponse(await this.tripKm.summary(date));
  }

  /** GET /trip-km/export?from=&to=&vehicleId= — Excel for Odoo Fleet › Odometers; marks rows exported. */
  @Get('export')
  @Permissions('trip-km.export')
  async export(
    @Query('from') from: string,
    @Query('to') to: string,
    @Res() res: express.Response,
    @Query('vehicleId') vehicleId?: string,
  ) {
    const { buffer, filename } = await this.tripKm.exportXlsx({ from, to, vehicleId });
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    res.send(buffer);
  }

  /** PATCH /trip-km/:id — correct a misread value (clears the flag, notes who). */
  @Patch(':id')
  @Permissions('trip-km.export')
  async correct(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { readingKm: number; note?: string },
    @CurrentUser('id') userId: string,
  ) {
    return new ApiResponse(await this.tripKm.correct(id, Number(body.readingKm), body.note, userId), 'Reading corrected');
  }

  /** GET /trip-km/:id/photo — the odometer photo. */
  @Get(':id/photo')
  @Permissions('trip-km')
  async photo(@Param('id', ParseUUIDPipe) id: string, @Res() res: express.Response) {
    const p = await this.tripKm.photo(id);
    res.set({ 'Content-Type': p.mimeType, 'Cache-Control': 'private, max-age=3600' });
    p.stream.pipe(res);
  }
}
