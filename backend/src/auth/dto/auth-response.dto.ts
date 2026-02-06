import type { UserRole } from '../../../generated/prisma/enums.js';

export class AuthUserDto {
  id!: string;
  email!: string;
  name!: string;
  role!: UserRole;
  repId?: string;
}

export class AuthResponseDto {
  accessToken!: string;
  refreshToken!: string;
  user!: AuthUserDto;
}
