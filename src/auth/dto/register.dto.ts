import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export const REGISTRATION_ROLES = [Role.CLIENT, Role.FREELANCER] as const;
export type RegistrationRole = (typeof REGISTRATION_ROLES)[number];

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class RegisterDto {
  @ApiProperty({ example: 'Sara Client' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiProperty({ example: 'sara@example.com' })
  @Transform(trim)
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @ApiProperty({ example: 'secure-password' })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;

  @ApiProperty({ enum: REGISTRATION_ROLES, example: Role.CLIENT })
  @IsIn(REGISTRATION_ROLES)
  role!: RegistrationRole;
}
