import {
  Injectable,
  BadGatewayException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, SchemaType, type Schema } from '@google/generative-ai';
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

/** Gemini responseSchema fragment for one source field (faqJson is structured). */
function fieldSchema(key: string) {
  if (key === 'faqJson') {
    return {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          question: { type: SchemaType.STRING },
          answer: { type: SchemaType.STRING },
        },
        required: ['question', 'answer'],
      },
    };
  }
  return { type: SchemaType.STRING };
}

@Injectable()
export class TranslateService {
  private readonly logger = new Logger(TranslateService.name);
  private genAI: GoogleGenerativeAI | null = null;

  constructor(
    private readonly translations: TranslationsService,
    private readonly configService: ConfigService,
  ) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (apiKey) {
      this.genAI = new GoogleGenerativeAI(apiKey);
    }
  }

  async translateEntity(dto: TranslateRequestDto) {
    if (!this.genAI) {
      throw new BadGatewayException(
        'Auto-translate is unavailable: GEMINI_API_KEY is not configured on the server.',
      );
    }

    const languageName = LANGUAGE_NAMES[dto.locale];
    const source = await this.translations.getEnglishSource(dto.entity, dto.id);

    const keys = Object.keys(source);
    if (keys.length === 0) {
      return { locale: dto.locale, translation: {} };
    }

    const responseSchema = {
      type: SchemaType.OBJECT,
      properties: Object.fromEntries(keys.map((k) => [k, fieldSchema(k)])),
      required: keys,
    } as unknown as Schema;

    const systemInstruction = [
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

    let translation: Record<string, unknown>;
    try {
      const model = this.genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        systemInstruction,
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema,
          temperature: 0.3,
        },
      });

      const result = await model.generateContent([
        {
          text: `Translate the values in this JSON to ${languageName}:\n${JSON.stringify(source)}`,
        },
      ]);
      translation = JSON.parse(result.response.text()) as Record<string, unknown>;
    } catch (err) {
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
