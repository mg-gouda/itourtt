import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpsertBlogPostDto {
  // Required on create; optional on update (service enforces).
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(220) title?: string;
  @IsOptional() @IsString() @MaxLength(220) slug?: string;
  @IsOptional() @IsString() @MaxLength(500) excerpt?: string;
  @IsOptional() @IsString() coverImageUrl?: string;

  // tiptap document JSON (re-editing) + rendered HTML (B2C display).
  @IsOptional() contentJson?: unknown;
  @IsOptional() @IsString() contentHtml?: string;

  @IsOptional() @IsString() @MaxLength(120) author?: string;
  @IsOptional() @IsIn(['DRAFT', 'PUBLISHED']) status?: string;

  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) categoryIds?: string[];

  @IsOptional() @IsString() @MaxLength(180) metaTitle?: string;
  @IsOptional() @IsString() @MaxLength(320) metaDescription?: string;
}

export class UpsertBlogCategoryDto {
  @IsString() @IsNotEmpty() @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(140) slug?: string;
}
