import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Update meta for a static B2C page. pageKey comes from the URL. */
export class UpsertPageSeoDto {
  @IsOptional() @IsString() @MaxLength(180) metaTitle?: string;
  @IsOptional() @IsString() @MaxLength(320) metaDescription?: string;
}
