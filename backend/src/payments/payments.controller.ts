import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  Res,
  Headers,
  RawBody,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { PaymentsService } from './payments.service.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { Public } from '../common/decorators/public.decorator.js';
import { ApiResponse } from '../common/dto/api-response.dto.js';
import type { GetPayInCallback } from './gateways/getpayin.gateway.js';
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
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly configService: ConfigService,
  ) {}

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

  // ─── Stripe Webhook (NO AUTH — verified by Stripe signature) ───
  @Public()
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

  // ─── GetPayIn Webhook (NO AUTH — verified by HMAC signature) ───
  // Configure this exact URL as the "Webhook URL" in the GetPayIn dashboard:
  //   https://<backend-host>/api/payments/webhook/getpayin
  @Public()
  @Post('webhook/getpayin')
  @HttpCode(200)
  async getPayInWebhook(@Body() body: GetPayInCallback) {
    const result = await this.paymentsService.processGetPayInCallback(body);
    return { success: true, message: 'Webhook processed', paid: result.paid };
  }

  // ─── GetPayIn Redirect Return (browser GET) ────────────
  // Configure this exact URL as the "Redirect URL" in the GetPayIn dashboard:
  //   https://<backend-host>/api/payments/return/getpayin
  // It verifies the signature, settles the booking, then bounces the customer
  // to the public site's success/cancel page.
  @Public()
  @Get('return/getpayin')
  async getPayInReturn(
    @Query() query: GetPayInCallback,
    @Res() res: Response,
  ) {
    const siteUrl = (
      this.configService.get<string>('B2C_SITE_URL') || 'https://transfera.ae'
    ).replace(/\/+$/, '');

    let paid = false;
    let bookingRef: string | null = null;
    try {
      const result = await this.paymentsService.processGetPayInCallback(query);
      paid = result.paid;
      bookingRef = result.bookingRef;
    } catch {
      // Signature/processing failure → treat as a failed payment for the guest.
      paid = false;
    }

    const refParam = bookingRef ? `?ref=${encodeURIComponent(bookingRef)}` : '';
    const target = paid
      ? `${siteUrl}/payment/success${refParam}`
      : `${siteUrl}/payment/cancel${refParam}`;
    return res.redirect(302, target);
  }

  // ─── Verify Payment Status (Public) ────────────────────
  @Public()
  @Post('verify/:bookingRef')
  @HttpCode(200)
  async verifyPayment(@Param('bookingRef') bookingRef: string) {
    const result =
      await this.paymentsService.verifyPaymentStatus(bookingRef);
    return new ApiResponse(result);
  }
}
