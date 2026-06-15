import {
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
  ArrayMaxSize,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

// One chat turn. `assistant` turns are the model's previous replies echoed back
// by the client so the stateless endpoint can continue the conversation.
export class AiChatMessageDto {
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  // Generous: assistant turns are the model's own replies echoed back, and a
  // vehicle/extras listing or summary (esp. in character-dense scripts like
  // Arabic) easily exceeds 1000. Abuse is bounded by ArrayMaxSize + throttling.
  @IsString()
  @MaxLength(4000)
  content!: string;
}

export class AiSearchRequestDto {
  @IsArray()
  @ArrayMinSize(1)
  // The client only sends a recent window of the transcript (full booking state
  // is carried in `draft`), so this cap just bounds cost/abuse with headroom.
  @ArrayMaxSize(24)
  @ValidateNested({ each: true })
  @Type(() => AiChatMessageDto)
  messages!: AiChatMessageDto[];

  @IsOptional()
  @IsString()
  @MaxLength(8)
  locale?: string;

  // The evolving booking state the assistant returned last turn, echoed back by
  // the client so this stateless endpoint can continue where it left off.
  @IsOptional()
  @IsObject()
  draft?: Record<string, unknown>;
}
