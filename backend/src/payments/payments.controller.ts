import {
  Controller,
  Post,
  Param,
  Body,
  Headers,
  RawBody,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { PaymentsService } from './payments.service.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { ApiResponse } from '../common/dto/api-response.dto.js';
import { IsString, IsNotEmpty } from 'class-validator';

class CreatePaymentSessionDto {
  @IsString()
  @IsNotEmpty()
  bookingRef!: string;

  @IsString()
  @IsNotEmpty()
  gateway!: string;

  @IsString()
  @IsNotEmpty()
  returnUrl!: string;

  @IsString()
  @IsNotEmpty()
  cancelUrl!: string;
}

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  // ─── Create Payment Session (JWT Protected) ────────────
  @Post('create-session')
  @UseGuards(JwtAuthGuard)
  async createSession(@Body() dto: CreatePaymentSessionDto) {
    const result = await this.paymentsService.createPaymentSession(
      dto.bookingRef,
      dto.gateway,
      dto.returnUrl,
      dto.cancelUrl,
    );
    return new ApiResponse(result, 'Payment session created successfully');
  }

  // ─── Stripe Webhook (NO AUTH) ──────────────────────────
  @Post('webhook/stripe')
  @HttpCode(200)
  async stripeWebhook(
    @RawBody() rawBody: Buffer,
    @Headers('stripe-signature') signature: string,
  ) {
    const result = await this.paymentsService.handleStripeWebhook(
      rawBody,
      signature,
    );
    return result;
  }

  // ─── Verify Payment Status (Public) ────────────────────
  @Post('verify/:bookingRef')
  @HttpCode(200)
  async verifyPayment(@Param('bookingRef') bookingRef: string) {
    const result =
      await this.paymentsService.verifyPaymentStatus(bookingRef);
    return new ApiResponse(result);
  }
}
