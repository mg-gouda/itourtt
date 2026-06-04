import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsArray,
  MaxLength,
} from 'class-validator';

export class CityPageBodySectionDto {
  @IsOptional() @IsString() heading?: string;
  @IsOptional() @IsString() body?: string;
}

export class CityPageFaqDto {
  @IsOptional() @IsString() question?: string;
  @IsOptional() @IsString() answer?: string;
}

/** Create/update the CMS landing page attached to a City. cityId comes from the URL. */
export class UpsertCityPageDto {
  @IsOptional() @IsString() @MaxLength(160) slug?: string;
  @IsOptional() @IsBoolean() isPublished?: boolean;
  @IsOptional() @IsBoolean() showInMenu?: boolean;
  @IsOptional() @IsInt() menuOrder?: number;

  @IsOptional() @IsString() @MaxLength(200) heroHeadline?: string;
  @IsOptional() @IsString() heroImageUrl?: string;
  @IsOptional() @IsString() introText?: string;
  @IsOptional() @IsString() contentHtml?: string;

  // Flexible JSON content — array of { heading, body } / { question, answer }.
  @IsOptional() @IsArray() bodyJson?: CityPageBodySectionDto[];
  @IsOptional() @IsArray() faqJson?: CityPageFaqDto[];

  @IsOptional() @IsString() @MaxLength(180) metaTitle?: string;
  @IsOptional() @IsString() @MaxLength(320) metaDescription?: string;
}
