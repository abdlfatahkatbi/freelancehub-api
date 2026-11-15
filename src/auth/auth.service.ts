import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthenticatedUser } from './auth.types';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const password = await bcrypt.hash(dto.password, 10);

    try {
      // nested create = one atomic operation (no explicit $transaction needed)
      const user = await this.prisma.user.create({
        data: {
          name: dto.name,
          email: dto.email.toLowerCase(),
          password,
          role: dto.role,
          wallet: { create: {} },
          ...(dto.role === Role.FREELANCER && { profile: { create: {} } }),
        },
        select: { id: true, name: true, email: true, role: true },
      });

      return this.issueToken(user);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Email is already registered');
      }
      throw error;
    }
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isBanned: true,
        password: true,
      },
    });

    const passwordOk =
      !!user && (await bcrypt.compare(dto.password, user.password));

    if (!user || !passwordOk) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.isBanned) {
      throw new ForbiddenException('This account is banned');
    }

    return this.issueToken({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    });
  }

  private issueToken(user: AuthenticatedUser) {
    const accessToken = this.jwtService.sign({ sub: user.id });
    return { accessToken, user };
  }
}
