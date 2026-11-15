import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PaginationDto } from './dto/pagination.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async listUsers({ page, limit }: PaginationDto) {
    const skip = (page - 1) * limit;
    const [total, data] = await this.prisma.$transaction([
      this.prisma.user.count(),
      this.prisma.user.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isBanned: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async banUser(id: number) {
    const user = await this.findUser(id);
    if (user.role === Role.ADMIN) {
      throw new ForbiddenException('Admins cannot be banned');
    }

    return this.prisma.user.update({
      where: { id },
      data: { isBanned: true },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isBanned: true,
      },
    });
  }

  async unbanUser(id: number) {
    await this.findUser(id);
    return this.prisma.user.update({
      where: { id },
      data: { isBanned: false },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isBanned: true,
      },
    });
  }

  private async findUser(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }
}
