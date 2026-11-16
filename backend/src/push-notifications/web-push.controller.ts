import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { IsString, IsUrl, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { ApiResponse } from '../common/dto/api-response.dto.js';
import { WebPushService } from './web-push.service.js';

class PushKeysDto {
  @IsString()
  @MaxLength(256)
  p256dh!: string;

  @IsString()
  @MaxLength(256)
  auth!: string;
}

class SubscribeDto {
  @IsUrl({ protocols: ['https'], require_tld: true })
  @MaxLength(2048)
  endpoint!: string;

  @ValidateNested()
  @Type(() => PushKeysDto)
  keys!: PushKeysDto;
}

class UnsubscribeDto {
  @IsString()
  @MaxLength(2048)
  endpoint!: string;
}

type Caller = { sub: string; role: string };

/**
 * RolesGuard yields to the permission system for any user with a roleId, so
 * @Roles alone does not keep staff out — check the account type explicitly.
 */
function portalOnly(user: Caller) {
  if (user.role !== 'REP' && user.role !== 'DRIVER') {
    throw new ForbiddenException('Browser push is only for the rep and driver portals');
  }
}

/** Browser push subscriptions for the rep/driver web portals. */
@Controller('push/web')
@UseGuards(RolesGuard)
@Roles('REP', 'DRIVER')
export class WebPushController {
  constructor(private readonly webPush: WebPushService) {}

  /** VAPID public key; `null` when browser push is not configured. */
  @Get('public-key')
  publicKey(@CurrentUser() user: Caller) {
    portalOnly(user);
    return new ApiResponse({ publicKey: this.webPush.getPublicKey() });
  }

  @Post('subscribe')
  @HttpCode(204)
  async subscribe(
    @CurrentUser() user: Caller,
    @Body() dto: SubscribeDto,
    @Req() req: Request,
  ) {
    portalOnly(user);
    await this.webPush.subscribe(user.sub, dto, req.headers['user-agent']?.slice(0, 300));
  }

  @Post('unsubscribe')
  @HttpCode(204)
  async unsubscribe(@CurrentUser() user: Caller, @Body() dto: UnsubscribeDto) {
    portalOnly(user);
    await this.webPush.unsubscribe(user.sub, dto.endpoint);
  }
}
