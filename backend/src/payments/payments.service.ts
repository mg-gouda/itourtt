import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service.js';
import { EmailService } from '../email/email.service.js';
import { StripeGateway } from './gateways/stripe.gateway.js';
import { EgyptBankGateway } from './gateways/egypt-bank.gateway.js';
import { DubaiBankGateway } from './gateways/dubai-bank.gateway.js';
import type { PaymentGateway } from './gateways/gateway.interface.js';
import {
  B2CPaymentGateway,
  B2CPaymentStatus,
} from '../../generated/prisma/enums.js';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
    private readonly stripeGateway: StripeGateway,
    private readonly egyptBankGateway: EgyptBankGateway,
    private readonly dubaiBankGateway: DubaiBankGateway,
  ) {}

  private getGateway(gateway: string): PaymentGateway {
    switch (gateway) {
      case 'STRIPE':
        return this.stripeGateway;
      case 'EGYPT_BANK':
        return this.egyptBankGateway;
      case 'DUBAI_BANK':
        return this.dubaiBankGateway;
      default:
        throw new BadRequestException(`Unsupported payment gateway: ${gateway}`);
    }
  }

  async createPaymentSession(
    bookingRef: string,
    gateway: string,
    returnUrl: string,
    cancelUrl: string,
  ) {
    // Find the guest booking
    const booking = await this.prisma.guestBooking.findUnique({
      where: { bookingRef },
    });

    if (!booking) {
      throw new NotFoundException(
        `Booking with reference "${bookingRef}" not found`,
      );
    }

    if (booking.paymentStatus === B2CPaymentStatus.PAID as B2CPaymentStatus) {
      throw new BadRequestException('This booking has already been paid');
    }

    const paymentGateway = this.getGateway(gateway);

    // Create the payment session with the gateway
    const session = await paymentGateway.createSession(
      bookingRef,
      Number(booking.total),
      booking.currency,
      returnUrl,
      cancelUrl,
    );

    // Create a PaymentTransaction record with status PENDING (INITIATED)
    await this.prisma.paymentTransaction.create({
      data: {
        guestBookingId: booking.id,
        gateway: gateway as B2CPaymentGateway,
        gatewayTransactionId: session.sessionId,
        amount: booking.total,
        currency: booking.currency,
        status: B2CPaymentStatus.PENDING as B2CPaymentStatus,
        rawResponse: { sessionId: session.sessionId, checkoutUrl: session.checkoutUrl },
      },
    });

    return {
      checkoutUrl: session.checkoutUrl,
      sessionId: session.sessionId,
      gateway: session.gateway,
    };
  }

  async handleStripeWebhook(rawBody: Buffer, signature: string) {
    const webhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!webhookSecret) {
      throw new BadRequestException('Stripe webhook secret is not configured');
    }

    const stripeSecretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      throw new BadRequestException('Stripe is not configured');
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2024-12-18.acacia' as Stripe.LatestApiVersion,
    });

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err) {
      this.logger.error(`Stripe webhook signature verification failed: ${err}`);
      throw new BadRequestException('Invalid webhook signature');
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const sessionId = session.id;
      const bookingRef = session.metadata?.bookingRef;

      if (!bookingRef) {
        this.logger.warn(`Stripe webhook: no bookingRef in session metadata for ${sessionId}`);
        return { received: true };
      }

      // Find the payment transaction by gatewayTransactionId
      const transaction = await this.prisma.paymentTransaction.findFirst({
        where: { gatewayTransactionId: sessionId },
      });

      if (transaction) {
        // Update transaction status
        await this.prisma.paymentTransaction.update({
          where: { id: transaction.id },
          data: {
            status: B2CPaymentStatus.PAID as B2CPaymentStatus,
            rawResponse: JSON.parse(JSON.stringify(session)),
          },
        });

        // Update GuestBooking payment status
        await this.prisma.guestBooking.update({
          where: { bookingRef },
          data: {
            paymentStatus: B2CPaymentStatus.PAID as B2CPaymentStatus,
            paymentGateway: B2CPaymentGateway.STRIPE as B2CPaymentGateway,
            paymentReference: (session.payment_intent as string) || sessionId,
          },
        });

        this.logger.log(`Payment completed for booking ${bookingRef}, session ${sessionId}`);

        // Send payment receipt email (fire-and-forget)
        const paidBooking = await this.prisma.guestBooking.findUnique({
          where: { bookingRef },
        });
        if (paidBooking) {
          this.emailService
            .sendPaymentReceipt({
              bookingRef,
              guestName: paidBooking.guestName,
              guestEmail: paidBooking.guestEmail,
              amount: Number(paidBooking.total),
              currency: paidBooking.currency,
              gateway: 'Stripe',
              transactionId: (session.payment_intent as string) || sessionId,
              paidAt: new Date().toISOString(),
            })
            .catch((err) =>
              this.logger.error(`Failed to send payment receipt email: ${err.message}`),
            );
        }
      } else {
        this.logger.warn(`No payment transaction found for session ${sessionId}`);
      }
    }

    return { received: true };
  }

  async verifyPaymentStatus(bookingRef: string) {
    const booking = await this.prisma.guestBooking.findUnique({
      where: { bookingRef },
      include: {
        paymentTransactions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!booking) {
      throw new NotFoundException(
        `Booking with reference "${bookingRef}" not found`,
      );
    }

    const latestTransaction = booking.paymentTransactions[0] || null;

    return {
      bookingRef: booking.bookingRef,
      paymentStatus: booking.paymentStatus,
      paymentMethod: booking.paymentMethod,
      paymentGateway: booking.paymentGateway,
      paymentReference: booking.paymentReference,
      total: Number(booking.total),
      currency: booking.currency,
      latestTransaction: latestTransaction
        ? {
            id: latestTransaction.id,
            gateway: latestTransaction.gateway,
            status: latestTransaction.status,
            amount: Number(latestTransaction.amount),
            currency: latestTransaction.currency,
            createdAt: latestTransaction.createdAt,
          }
        : null,
    };
  }

  async refundPayment(bookingRef: string) {
    const booking = await this.prisma.guestBooking.findUnique({
      where: { bookingRef },
      include: {
        paymentTransactions: {
          where: { status: B2CPaymentStatus.PAID as B2CPaymentStatus },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!booking) {
      throw new NotFoundException(
        `Booking with reference "${bookingRef}" not found`,
      );
    }

    if (booking.paymentStatus !== (B2CPaymentStatus.PAID as B2CPaymentStatus)) {
      throw new BadRequestException(
        'Cannot refund a booking that has not been paid',
      );
    }

    const successfulTransaction = booking.paymentTransactions[0];
    if (!successfulTransaction) {
      throw new NotFoundException(
        'No successful payment transaction found for this booking',
      );
    }

    const gateway = this.getGateway(successfulTransaction.gateway);

    // Find the actual payment intent / transaction ID to refund
    const transactionId =
      successfulTransaction.gatewayTransactionId || successfulTransaction.id;

    // For Stripe, we need the payment_intent, not the session ID
    // Try to get it from raw response if available
    let refundTransactionId = transactionId;
    if (
      successfulTransaction.gateway === (B2CPaymentGateway.STRIPE as B2CPaymentGateway) &&
      successfulTransaction.rawResponse
    ) {
      const rawResponse = successfulTransaction.rawResponse as Record<string, unknown>;
      if (rawResponse.payment_intent) {
        refundTransactionId = rawResponse.payment_intent as string;
      }
    }

    const refundResult = await gateway.refund(
      refundTransactionId,
      Number(successfulTransaction.amount),
    );

    if (refundResult.success) {
      // Update the transaction status
      await this.prisma.paymentTransaction.update({
        where: { id: successfulTransaction.id },
        data: {
          status: B2CPaymentStatus.REFUNDED as B2CPaymentStatus,
        },
      });

      // Update booking payment status
      await this.prisma.guestBooking.update({
        where: { bookingRef },
        data: {
          paymentStatus: B2CPaymentStatus.REFUNDED as B2CPaymentStatus,
        },
      });

      // Create a refund transaction record
      await this.prisma.paymentTransaction.create({
        data: {
          guestBookingId: booking.id,
          gateway: successfulTransaction.gateway,
          gatewayTransactionId: refundResult.refundId,
          amount: successfulTransaction.amount,
          currency: successfulTransaction.currency,
          status: B2CPaymentStatus.REFUNDED as B2CPaymentStatus,
          rawResponse: { refundId: refundResult.refundId },
        },
      });
    }

    return {
      success: refundResult.success,
      refundId: refundResult.refundId,
      bookingRef,
    };
  }
}
