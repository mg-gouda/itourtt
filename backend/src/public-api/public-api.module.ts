import { Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PublicApiController } from './public-api.controller.js';
import { PublicApiService } from './public-api.service.js';
import { EmailModule } from '../email/email.module.js';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 60,
      },
    ]),
    EmailModule,
  ],
  controllers: [PublicApiController],
  providers: [
    PublicApiService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class PublicApiModule {}
