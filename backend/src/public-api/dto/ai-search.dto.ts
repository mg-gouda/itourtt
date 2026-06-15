import {
  IsArray,
  IsIn,
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

  @IsString()
  @MaxLength(1000)
  content!: string;
}

export class AiSearchRequestDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(16) // cap conversation length to bound cost/abuse
  @ValidateNested({ each: true })
  @Type(() => AiChatMessageDto)
  messages!: AiChatMessageDto[];

  @IsOptional()
  @IsString()
  @MaxLength(8)
  locale?: string;
}
