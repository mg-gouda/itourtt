import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { CityPageFaqDto } from './city-page.dto.js';
import { SUPPORTED_LOCALES } from '../locale.util.js';

export const TRANSLATABLE_ENTITIES = [
  'city_page',
  'blog_post',
  'page_seo',
  'static_page',
] as const;
export type TranslatableEntity = (typeof TRANSLATABLE_ENTITIES)[number];

/** Translation payload for a destination landing page (English base lives on CityPage). */
export class UpsertCityPageTranslationDto {
  @IsOptional() @IsString() @MaxLength(200) heroHeadline?: string;
  @IsOptional() @IsString() introText?: string;
  @IsOptional() @IsString() contentHtml?: string;
  @IsOptional() @IsArray() faqJson?: CityPageFaqDto[];
  @IsOptional() @IsString() @MaxLength(180) metaTitle?: string;
  @IsOptional() @IsString() @MaxLength(320) metaDescription?: string;
}

/** Translation payload for a blog post. */
export class UpsertBlogPostTranslationDto {
  @IsOptional() @IsString() @MaxLength(255) title?: string;
  @IsOptional() @IsString() excerpt?: string;
  @IsOptional() @IsString() contentHtml?: string;
  @IsOptional() @IsString() @MaxLength(180) metaTitle?: string;
  @IsOptional() @IsString() @MaxLength(320) metaDescription?: string;
}

/** Translation payload for a static page's SEO meta. */
export class UpsertPageSeoTranslationDto {
  @IsOptional() @IsString() @MaxLength(180) metaTitle?: string;
  @IsOptional() @IsString() @MaxLength(320) metaDescription?: string;
}

/** Translation payload for a CMS static page. */
export class UpsertStaticPageTranslationDto {
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsString() content?: string;
  @IsOptional() @IsString() @MaxLength(180) metaTitle?: string;
  @IsOptional() @IsString() @MaxLength(320) metaDescription?: string;
}

/** Body for the Claude-backed auto-translate endpoint. */
export class TranslateRequestDto {
  @IsIn(TRANSLATABLE_ENTITIES) entity!: TranslatableEntity;
  // Identifier shown in the matching admin editor:
  //   city_page → cityId, blog_post → post id, page_seo → pageKey.
  @IsString() id!: string;
  @IsIn(SUPPORTED_LOCALES as unknown as string[]) locale!: string;
  @IsOptional() @IsBoolean() save?: boolean;
}
