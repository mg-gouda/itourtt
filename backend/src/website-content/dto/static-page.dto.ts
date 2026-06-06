import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateStaticPageDto {
  @IsString() @IsNotEmpty() @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(200) slug?: string;
  @IsOptional() @IsString() content?: string;
  @IsOptional() @IsBoolean() isPublished?: boolean;

  // Menu placement
  @IsOptional() @IsBoolean() showInNav?: boolean;
  @IsOptional() @IsBoolean() showInFooter?: boolean;
  @IsOptional() @IsInt() menuOrder?: number;

  // SEO
  @IsOptional() @IsString() @MaxLength(180) metaTitle?: string;
  @IsOptional() @IsString() @MaxLength(320) metaDescription?: string;
}

export class UpdateStaticPageDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(200) slug?: string;
  @IsOptional() @IsString() content?: string;
  @IsOptional() @IsBoolean() isPublished?: boolean;

  @IsOptional() @IsBoolean() showInNav?: boolean;
  @IsOptional() @IsBoolean() showInFooter?: boolean;
  @IsOptional() @IsInt() menuOrder?: number;

  @IsOptional() @IsString() @MaxLength(180) metaTitle?: string;
  @IsOptional() @IsString() @MaxLength(320) metaDescription?: string;
}
