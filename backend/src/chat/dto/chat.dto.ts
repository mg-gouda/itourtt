import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsNumber,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  CHAT_BROADCAST_AUDIENCES,
  CHAT_MAX_TEXT,
  CHAT_MAX_VOICE_SEC,
  type ChatBroadcastAudienceKey,
} from '../chat.constants.js';

export class OpenConversationDto {
  /** The other participant's User.id. */
  @IsUUID()
  userId!: string;
}

export class ContactsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  /** Staff side only: which portal users to list. */
  @IsOptional()
  @IsIn(['REP', 'DRIVER'])
  role?: 'REP' | 'DRIVER';
}

export class MessagesQueryDto {
  /** Only messages created after this instant (live polling). */
  @IsOptional()
  @IsDateString()
  after?: string;

  /** Only messages created before this instant (loading older history). */
  @IsOptional()
  @IsDateString()
  before?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

/** Multipart fields of POST /chat/conversations/:id/messages (the file is `file`). */
export class SendMessageDto {
  @IsIn(['TEXT', 'IMAGE', 'VOICE', 'LOCATION'])
  kind!: 'TEXT' | 'IMAGE' | 'VOICE' | 'LOCATION';

  @IsOptional()
  @IsString()
  @MaxLength(CHAT_MAX_TEXT)
  body?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(CHAT_MAX_VOICE_SEC)
  durationSec?: number;

  /** LOCATION only. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-180)
  @Max(180)
  longitude?: number;

  /** GPS accuracy in metres, as the browser reported it. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(100000)
  accuracyM?: number;
}

/** Multipart fields of POST /chat/broadcasts — a message plus who receives it. */
export class SendBroadcastDto extends SendMessageDto {
  @IsIn(CHAT_BROADCAST_AUDIENCES)
  audience!: ChatBroadcastAudienceKey;
}

export class BroadcastListQueryDto {
  /** Only items created before this instant (paging back). */
  @IsOptional()
  @IsDateString()
  before?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class UpdateChatSettingsDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  driverContactRoles?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  repContactRoles?: string[];
}
