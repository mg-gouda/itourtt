import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';
import { StripeGateway } from './gateways/stripe.gateway.js';
import { EgyptBankGateway } from './gateways/egypt-bank.gateway.js';
import { DubaiBankGateway } from './gateways/dubai-bank.gateway.js';
import { EmailModule } from '../email/email.module.js';

@Module({
  imports: [EmailModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    StripeGateway,
    EgyptBankGateway,
    DubaiBankGateway,
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
