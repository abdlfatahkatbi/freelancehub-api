import { Role } from '@prisma/client';

export interface AuthenticatedUser {
  id: number;
  name: string;
  email: string;
  role: Role;
}

export interface JwtPayload {
  sub: number;
}
