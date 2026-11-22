import { IsBoolean, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  identifier!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password!: string;

  /**
   * REP/DRIVER: confirm taking over a session that is open on another device or
   * the portal. Without it the server answers 409 SESSION_ACTIVE_ELSEWHERE.
   */
  @IsOptional()
  @IsBoolean()
  takeover?: boolean;
}
