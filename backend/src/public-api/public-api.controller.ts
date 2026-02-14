import {
  Controller,
  Get,
  Post,
  Param,
  Body,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PublicApiService } from './public-api.service.js';
import { QuoteRequestDto } from './dto/quote-request.dto.js';
import { CreateGuestBookingDto } from './dto/create-guest-booking.dto.js';
import { ApiResponse } from '../common/dto/api-response.dto.js';

@Controller('public')
export class PublicApiController {
  constructor(private readonly publicApiService: PublicApiService) {}

  @Get('locations')
  async getLocations() {
    const result = await this.publicApiService.getLocationTree();
    return new ApiResponse(result);
  }

  @Get('vehicle-types')
  async getVehicleTypes() {
    const result = await this.publicApiService.getVehicleTypes();
    return new ApiResponse(result);
  }

  @Post('quote')
  async getQuote(@Body() dto: QuoteRequestDto) {
    const result = await this.publicApiService.getQuote(dto);
    return new ApiResponse(result);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('bookings')
  async createBooking(@Body() dto: CreateGuestBookingDto) {
    const result = await this.publicApiService.createBooking(dto);
    return new ApiResponse(result, 'Booking created successfully.');
  }

  @Get('bookings/:ref')
  async getBooking(@Param('ref') ref: string) {
    const result = await this.publicApiService.getBooking(ref);
    return new ApiResponse(result);
  }

  @Post('bookings/:ref/cancel')
  async cancelBooking(@Param('ref') ref: string) {
    const result = await this.publicApiService.cancelBooking(ref);
    return new ApiResponse(result, 'Booking cancelled successfully.');
  }
}
