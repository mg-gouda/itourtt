import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  bookingConfirmationTemplate,
  paymentReceiptTemplate,
  bookingCancellationTemplate,
  driverAssignmentTemplate,
  jobUpdateNotificationTemplate,
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

export interface JobUpdateEmailData {
  internalRef: string;
  bookingChannel: string;
  bookingStatus: string;
  jobStatus: string;
  agentName?: string;
  agentRef?: string;
  customerName?: string;
  serviceType: string;
  jobDate: string;
  pickUpTime?: string;
  adultCount: number;
  childCount: number;
  paxCount: number;
  clientName?: string;
  clientMobile?: string;
  originLocation?: string;
  destinationLocation?: string;
  flightNo?: string;
  notes?: string;
  updatedBy: string;
  updatedAt: string;
  changedFields: string[];
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null = null;
  private fromAddress: string;
  private dbInitialized = false;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
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
      this.logger.warn('SMTP_HOST not configured via env — will check DB settings on first send');
    }
  }

  /** Lazily load SMTP config from DB if env vars aren't set. */
  private async ensureTransporter(): Promise<void> {
    if (this.transporter || this.dbInitialized) return;
    this.dbInitialized = true;

    try {
      const settings = await this.prisma.emailSettings.findFirst();
      if (settings?.smtpHost) {
        this.transporter = nodemailer.createTransport({
          host: settings.smtpHost,
          port: settings.smtpPort,
          secure: settings.smtpSecure,
          auth: {
            user: settings.smtpUser ?? undefined,
            pass: settings.smtpPass ?? undefined,
          },
        });
        this.fromAddress = settings.fromAddress;
        this.logger.log(`Email transporter configured from DB with host: ${settings.smtpHost}`);
      }
    } catch (err) {
      this.logger.error(`Failed to load email settings from DB: ${(err as Error).message}`);
    }
  }

  /** Force reload transporter from DB (called after settings update). */
  reloadTransporter(): void {
    this.transporter = null;
    this.dbInitialized = false;
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

  async sendJobUpdateNotification(recipients: string[], data: JobUpdateEmailData): Promise<void> {
    const html = jobUpdateNotificationTemplate(data);
    const subject = `${data.bookingStatus} - ${data.internalRef} - ${data.agentRef || 'N/A'} - ${data.updatedAt}`;
    for (const to of recipients) {
      await this.send(to, subject, html);
    }
  }

  async sendTestEmail(to: string): Promise<void> {
    const html = `
      <div style="font-family:Arial,sans-serif;padding:20px;">
        <h2 style="color:#333;">iTour TT — Test Email</h2>
        <p>This is a test email to verify your SMTP configuration.</p>
        <p>If you received this email, your settings are working correctly.</p>
        <hr style="border:none;border-top:1px solid #eee;margin:20px 0;" />
        <p style="color:#999;font-size:12px;">Sent at ${new Date().toLocaleString('en-GB', { timeZone: 'Africa/Cairo' })} (Cairo time)</p>
      </div>
    `;
    await this.send(to, 'iTour TT — SMTP Test', html);
  }

  private async send(to: string, subject: string, html: string): Promise<void> {
    await this.ensureTransporter();
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
