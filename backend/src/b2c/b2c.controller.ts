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
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
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
