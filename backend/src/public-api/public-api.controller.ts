import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Ip,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PublicApiService } from './public-api.service.js';
import { QuoteRequestDto } from './dto/quote-request.dto.js';
import { CreateGuestBookingDto } from './dto/create-guest-booking.dto.js';
import { VehicleQuotesRequestDto } from './dto/vehicle-quotes-request.dto.js';
import { AiSearchRequestDto } from './dto/ai-search.dto.js';
import { ContactMessageDto } from './dto/contact-message.dto.js';
import { BookingAccessDto } from './dto/booking-access.dto.js';
import { ResolvePlaceDto } from './dto/resolve-place.dto.js';
import { ApiResponse } from '../common/dto/api-response.dto.js';
import { Public } from '../common/decorators/public.decorator.js';
import { CaptchaService } from '../common/services/captcha.service.js';
import { AiSearchService } from './ai-search.service.js';

@Public() // Unauthenticated B2C surface — exempt from the global JwtAuthGuard.
@Controller('public')
@Throttle({ default: { limit: 120, ttl: 60000 } }) // 120 req/min per IP for all public endpoints
export class PublicApiController {
  constructor(
    private readonly publicApiService: PublicApiService,
    private readonly captchaService: CaptchaService,
    private readonly aiSearchService: AiSearchService,
  ) {}

  @Get('website-settings')
  async getWebsiteSettings() {
    const result = await this.publicApiService.getWebsiteSettings();
    return new ApiResponse(result);
  }

  @Get('google-maps-key')
  async getGoogleMapsKey() {
    const result = await this.publicApiService.getGoogleMapsKey();
    return new ApiResponse(result);
  }

  @Get('locations')
  async getLocations() {
    const result = await this.publicApiService.getLocationTree();
    return new ApiResponse(result);
  }

  @Throttle({ default: { limit: 40, ttl: 60000 } })
  @Post('resolve-place')
  async resolvePlace(@Body() dto: ResolvePlaceDto) {
    const result = await this.publicApiService.resolvePlace(dto);
    return new ApiResponse(result);
  }

  @Get('vehicle-types')
  async getVehicleTypes() {
    const result = await this.publicApiService.getVehicleTypes();
    return new ApiResponse(result);
  }

  @Get('extras')
  async getExtras() {
    const result = await this.publicApiService.getExtras();
    return new ApiResponse(result);
  }

  @Throttle({ default: { limit: 60, ttl: 60000 } }) // pricing is scrape-prone — tighter cap
  @Post('vehicle-quotes')
  async getVehicleQuotes(@Body() dto: VehicleQuotesRequestDto) {
    const result = await this.publicApiService.getVehicleQuotes(dto);
    return new ApiResponse(result);
  }

  // Conversational "AI Mode" search — free text → structured transfer query.
  // Tightly capped: AI calls are costly and scrape-prone.
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('ai-search')
  async aiSearch(@Body() dto: AiSearchRequestDto) {
    const result = await this.aiSearchService.handle(dto);
    return new ApiResponse(result);
  }

  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Post('quote')
  async getQuote(@Body() dto: QuoteRequestDto) {
    const result = await this.publicApiService.getQuote(dto);
    return new ApiResponse(result);
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } }) // contact form — strict anti-abuse cap
  @Post('contact')
  async submitContact(@Body() dto: ContactMessageDto, @Ip() ip: string) {
    await this.captchaService.assertValid(dto.captchaToken, ip);
    const result = await this.publicApiService.submitContact(dto, ip);
    return new ApiResponse(result, 'Message sent.');
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('bookings')
  async createBooking(@Body() dto: CreateGuestBookingDto, @Ip() ip: string) {
    // Bot/abuse protection (no-op unless TURNSTILE_SECRET is configured).
    await this.captchaService.assertValid(dto.captchaToken, ip);
    const result = await this.publicApiService.createBooking(dto);
    return new ApiResponse(result, 'Booking created successfully.');
  }

  // Booking lookup requires the owner's email (sent in the body, not the URL,
  // to keep PII out of access logs). Rate-limited to slow ref+email guessing.
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('bookings/:ref/lookup')
  async getBooking(@Param('ref') ref: string, @Body() body: BookingAccessDto) {
    const result = await this.publicApiService.getBooking(ref, body.email);
    return new ApiResponse(result);
  }

  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('bookings/:ref/cancel')
  async cancelBooking(@Param('ref') ref: string, @Body() body: BookingAccessDto) {
    const result = await this.publicApiService.cancelBooking(ref, body.email);
    return new ApiResponse(result, 'Booking cancelled successfully.');
  }
}
