import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { B2CService } from './b2c.service.js';
import { B2CLoginDto, B2CChangePasswordDto, B2CAmendBookingDto } from './dto/b2c.dto.js';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { Public } from '../common/decorators/public.decorator.js';

@Controller('w-api')
export class B2CController {
  constructor(private readonly b2cService: B2CService) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: B2CLoginDto) {
    return this.b2cService.login(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  changePassword(@Request() req: any, @Body() dto: B2CChangePasswordDto) {
    return this.b2cService.changePassword(req.user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('bookings')
  getBookings(@Request() req: any) {
    return this.b2cService.getBookings(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('bookings/:ref')
  getBooking(@Request() req: any, @Param('ref') ref: string) {
    return this.b2cService.getBooking(req.user.id, ref);
  }

  // Ownership-scoped proxy: streams a driver/rep evidence image, but only if the
  // file belongs to a job the requesting guest owns (see service for the check).
  @UseGuards(JwtAuthGuard)
  @Get('bookings/:ref/evidence-file/:fileId')
  async getEvidenceFile(
    @Request() req: any,
    @Param('ref') ref: string,
    @Param('fileId') fileId: string,
    @Res() res: Response,
  ) {
    const result = await this.b2cService.getEvidenceFileStream(req.user.id, ref, fileId);
    res.set({
      'Content-Type': result.mimeType,
      'Cache-Control': 'private, max-age=3600',
    });
    result.stream.pipe(res);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('bookings/:ref')
  amendBooking(
    @Request() req: any,
    @Param('ref') ref: string,
    @Body() dto: B2CAmendBookingDto,
  ) {
    return this.b2cService.amendBooking(req.user.id, ref, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('bookings/:ref')
  @HttpCode(HttpStatus.OK)
  cancelBooking(@Request() req: any, @Param('ref') ref: string) {
    return this.b2cService.cancelBooking(req.user.id, ref);
  }
}
