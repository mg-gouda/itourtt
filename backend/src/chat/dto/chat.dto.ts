import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CHAT_MAX_TEXT, CHAT_MAX_VOICE_SEC } from '../chat.constants.js';

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
  @IsIn(['TEXT', 'IMAGE', 'VOICE'])
  kind!: 'TEXT' | 'IMAGE' | 'VOICE';

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
