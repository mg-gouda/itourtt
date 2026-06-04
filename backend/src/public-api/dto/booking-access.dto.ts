import { IsEmail, IsNotEmpty } from 'class-validator';

/**
 * Guests must prove ownership of a booking (by the email used to create it)
 * before they can view its PII / payment data or cancel it. Without this,
 * the booking reference alone — a short, date-scoped, guessable code — would
 * be enough to read a stranger's personal data (IDOR).
 */
export class BookingAccessDto {
  @IsEmail({}, { message: 'A valid email is required to access this booking.' })
  @IsNotEmpty()
  email!: string;
}
