import {
  Injectable,
  BadGatewayException,
  Logger,
} from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { TranslationsService } from './translations.service.js';
import { TranslateRequestDto } from './dto/translation.dto.js';

const LANGUAGE_NAMES: Record<string, string> = {
  ar: 'Arabic',
  de: 'German',
  fr: 'French',
  it: 'Italian',
  nl: 'Dutch',
  ru: 'Russian',
};

/** JSON-schema fragment for one source field (faqJson is structured; rest are strings). */
function fieldSchema(key: string) {
  if (key === 'faqJson') {
    return {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          question: { type: 'string' },
          answer: { type: 'string' },
        },
        required: ['question', 'answer'],
        additionalProperties: false,
      },
    };
  }
  return { type: 'string' };
}

@Injectable()
export class TranslateService {
  private readonly logger = new Logger(TranslateService.name);
  private client: Anthropic | null = null;

  constructor(private readonly translations: TranslationsService) {}

  private getClient(): Anthropic {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new BadGatewayException(
        'Auto-translate is unavailable: ANTHROPIC_API_KEY is not configured on the server.',
      );
    }
    if (!this.client) {
      this.client = new Anthropic(); // reads ANTHROPIC_API_KEY from env
    }
    return this.client;
  }

  async translateEntity(dto: TranslateRequestDto) {
    const languageName = LANGUAGE_NAMES[dto.locale];
    const source = await this.translations.getEnglishSource(dto.entity, dto.id);

    const keys = Object.keys(source);
    if (keys.length === 0) {
      return { locale: dto.locale, translation: {} };
    }

    const schema = {
      type: 'object',
      properties: Object.fromEntries(keys.map((k) => [k, fieldSchema(k)])),
      required: keys,
      additionalProperties: false,
    };

    const system = [
      `You are a professional translator for an Egyptian private airport-transfer booking service.`,
      `Translate the provided English content into ${languageName}.`,
      `Rules:`,
      `- Keep all HTML tags, attributes, and structure exactly intact; translate only the human-readable text between tags.`,
      `- Keep airport IATA codes unchanged (HRG, CAI, SSH, LXR, RMF).`,
      `- Keep brand and proper nouns unchanged (e.g. "Transfera", city/resort names like Hurghada, El Gouna, Naama Bay).`,
      `- Use a formal register suitable for a travel booking service.`,
      `- For faqJson, translate the "question" and "answer" values but keep the array structure.`,
      `- Return ONLY a JSON object whose keys exactly match the input keys.`,
    ].join('\n');

    const userPayload = JSON.stringify(source);

    let translation: Record<string, unknown>;
    try {
      const response = await this.getClient().messages.create({
        model: 'claude-opus-4-8',
        max_tokens: 16000,
        system,
        output_config: {
          format: { type: 'json_schema', schema },
        },
        messages: [
          {
            role: 'user',
            content: `Translate the values in this JSON to ${languageName}:\n${userPayload}`,
          },
        ],
      });

      if (response.stop_reason === 'max_tokens') {
        throw new BadGatewayException(
          'Translation was truncated (content too long). Try translating shorter content.',
        );
      }

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');
      translation = JSON.parse(text) as Record<string, unknown>;
    } catch (err) {
      if (err instanceof BadGatewayException) throw err;
      this.logger.error(
        `Auto-translate failed for ${dto.entity}/${dto.id} → ${dto.locale}`,
        err instanceof Error ? err.stack : String(err),
      );
      throw new BadGatewayException('Translation service failed. Please try again.');
    }

    if (dto.save) {
      await this.translations.saveTranslation(
        dto.entity,
        dto.id,
        dto.locale,
        translation,
      );
    }

    return { locale: dto.locale, translation };
  }
}
