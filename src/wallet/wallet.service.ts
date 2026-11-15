import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PaginationDto } from '../admin/dto/pagination.dto';
import { PrismaService } from '../prisma/prisma.service';
import { DepositDto } from './dto/deposit.dto';

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  async getBalance(userId: number) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
      select: { balance: true },
    });
    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }
    return wallet;
  }

  async deposit(userId: number, dto: DepositDto) {
    await this.ensureClient(userId);
    const amount = this.toDepositAmount(dto.amount);

    return this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.update({
        where: { userId },
        data: { balance: { increment: amount } },
        select: { id: true, balance: true },
      });
      await tx.transaction.create({
        data: {
          walletId: wallet.id,
          type: 'DEPOSIT',
          amount,
          balanceAfter: wallet.balance,
        },
      });
      return { balance: wallet.balance };
    });
  }

  async getTransactions(userId: number, query: PaginationDto) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    const where = { walletId: wallet.id };
    const [total, data] = await this.prisma.$transaction([
      this.prisma.transaction.count({ where }),
      this.prisma.transaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          id: true,
          type: true,
          amount: true,
          balanceAfter: true,
          contractId: true,
          createdAt: true,
        },
      }),
    ]);
    return {
      data,
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  private async ensureClient(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!user || user.role !== Role.CLIENT) {
      throw new ForbiddenException('Only clients can deposit funds');
    }
  }

  private toDepositAmount(value: string): Prisma.Decimal {
    try {
      const amount = new Prisma.Decimal(value);
      if (amount.lte(0) || amount.gt(100000)) {
        throw new BadRequestException(
          'Deposit amount must be greater than 0 and no more than 100000',
        );
      }
      return amount;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Deposit amount must be a valid amount');
    }
  }
}
