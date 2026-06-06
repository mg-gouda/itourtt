import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/** Payload for the public B2C contact form (POST /api/public/contact). */
export class ContactMessageDto {
  @IsString() @IsNotEmpty() @MaxLength(150) name!: string;
  @IsEmail() @MaxLength(200) email!: string;
  @IsOptional() @IsString() @MaxLength(50) phone?: string;
  @IsOptional() @IsString() @MaxLength(200) subject?: string;
  @IsString() @IsNotEmpty() @MaxLength(5000) message!: string;

  // Cloudflare Turnstile token (optional until TURNSTILE_SECRET is configured).
  @IsOptional() @IsString() captchaToken?: string;
}
