import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import {
  bookingConfirmationTemplate,
  paymentReceiptTemplate,
  bookingCancellationTemplate,
  driverAssignmentTemplate,
} from './templates/index.js';

export interface BookingEmailData {
  bookingRef: string;
  guestName: string;
  guestEmail: string;
  serviceType: string;
  jobDate: string;
  pickupTime?: string;
  fromZone: string;
  toZone: string;
  hotel?: string;
  flightNo?: string;
  paxCount: number;
  vehicleType: string;
  total: number;
  currency: string;
  paymentMethod: string;
}

export interface PaymentReceiptData {
  bookingRef: string;
  guestName: string;
  guestEmail: string;
  amount: number;
  currency: string;
  gateway: string;
  transactionId: string;
  paidAt: string;
}

export interface DriverAssignmentData {
  bookingRef: string;
  guestName: string;
  guestEmail: string;
  driverName: string;
  driverPhone: string;
  vehiclePlate: string;
  vehicleType: string;
  vehicleColor?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null = null;
  private fromAddress: string;

  constructor(private readonly config: ConfigService) {
    this.fromAddress = this.config.get<string>('SMTP_FROM', 'noreply@itour.local');

    const host = this.config.get<string>('SMTP_HOST');
    if (host) {
      this.transporter = nodemailer.createTransport({
        host,
        port: this.config.get<number>('SMTP_PORT', 587),
        secure: this.config.get<boolean>('SMTP_SECURE', false),
        auth: {
          user: this.config.get<string>('SMTP_USER'),
          pass: this.config.get<string>('SMTP_PASS'),
        },
      });
      this.logger.log(`Email transporter configured with host: ${host}`);
    } else {
      this.logger.warn('SMTP_HOST not configured — emails will be logged but not sent');
    }
  }

  async sendBookingConfirmation(data: BookingEmailData): Promise<void> {
    const html = bookingConfirmationTemplate(data);
    await this.send(data.guestEmail, `Booking Confirmed - ${data.bookingRef}`, html);
  }

  async sendPaymentReceipt(data: PaymentReceiptData): Promise<void> {
    const html = paymentReceiptTemplate(data);
    await this.send(data.guestEmail, `Payment Receipt - ${data.bookingRef}`, html);
  }

  async sendBookingCancellation(data: BookingEmailData): Promise<void> {
    const html = bookingCancellationTemplate(data);
    await this.send(data.guestEmail, `Booking Cancelled - ${data.bookingRef}`, html);
  }

  async sendDriverAssignment(data: DriverAssignmentData): Promise<void> {
    const html = driverAssignmentTemplate(data);
    await this.send(data.guestEmail, `Driver Assigned - ${data.bookingRef}`, html);
  }

  private async send(to: string, subject: string, html: string): Promise<void> {
    if (!this.transporter) {
      this.logger.log(`[Email Mock] To: ${to} | Subject: ${subject}`);
      return;
    }

    try {
      await this.transporter.sendMail({
        from: this.fromAddress,
        to,
        subject,
        html,
      });
      this.logger.log(`Email sent to ${to}: ${subject}`);
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}: ${(error as Error).message}`);
    }
  }
}
