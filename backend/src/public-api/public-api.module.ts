import { Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PublicApiController } from './public-api.controller.js';
import { PublicApiService } from './public-api.service.js';
import { AiSearchService } from './ai-search.service.js';
import { CaptchaService } from '../common/services/captcha.service.js';
import { EmailModule } from '../email/email.module.js';
import { GuestBookingsModule } from '../guest-bookings/guest-bookings.module.js';
import { B2CModule } from '../b2c/b2c.module.js';
import { PaymentsModule } from '../payments/payments.module.js';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 60,
      },
    ]),
    EmailModule,
    GuestBookingsModule,
    B2CModule,
    PaymentsModule,
  ],
  controllers: [PublicApiController],
  providers: [
    PublicApiService,
    AiSearchService,
    CaptchaService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class PublicApiModule {}
