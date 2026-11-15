import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ContractStatus,
  Prisma,
  ProjectStatus,
  Role,
  TransactionType,
} from '@prisma/client';
import { FilesService } from '../files/files.service';
import type { MemoryFile } from '../files/files.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DeliveriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly filesService: FilesService,
  ) {}

  async upload(
    freelancerId: number,
    projectId: number,
    file: MemoryFile | undefined,
  ) {
    if (!file) {
      throw new BadRequestException('A delivery file is required');
    }
    const contract = await this.findActiveContractForProject(
      projectId,
      freelancerId,
    );
    if (contract.project.status !== ProjectStatus.IN_PROGRESS) {
      throw new ConflictException(
        'Delivery can only be uploaded while the project is IN_PROGRESS',
      );
    }

    const filePath = await this.filesService.save(file, 'delivery');
    try {
      const delivery = await this.prisma.delivery.upsert({
        where: { contractId: contract.id },
        create: {
          contractId: contract.id,
          filePath,
          mime: file.mimetype,
        },
        update: {
          filePath,
          mime: file.mimetype,
        },
        select: {
          id: true,
          contractId: true,
          mime: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      if (contract.delivery?.filePath) {
        await this.filesService.delete(contract.delivery.filePath);
      }
      return delivery;
    } catch (error) {
      await this.filesService.delete(filePath);
      throw error;
    }
  }

  async download(userId: number, projectId: number) {
    const contract = await this.prisma.contract.findUnique({
      where: { projectId },
      select: {
        clientId: true,
        freelancerId: true,
        delivery: { select: { filePath: true, mime: true } },
      },
    });
    if (!contract) {
      throw new NotFoundException('Contract not found');
    }
    if (
      contract.clientId !== userId &&
      contract.freelancerId !== userId
    ) {
      throw new ForbiddenException(
        'Only the contract parties can download the delivery',
      );
    }
    if (!contract.delivery) {
      throw new NotFoundException('Delivery not found');
    }
    return {
      buffer: await this.filesService.read(contract.delivery.filePath),
      mime: contract.delivery.mime,
    };
  }

  async approve(clientId: number, projectId: number) {
    return this.prisma.$transaction(async (tx) => {
      const contract = await tx.contract.findUnique({
        where: { projectId },
        select: {
          id: true,
          amount: true,
          clientId: true,
          freelancerId: true,
          status: true,
          project: { select: { id: true, clientId: true, status: true } },
          delivery: { select: { id: true } },
        },
      });
      if (!contract) {
        throw new NotFoundException('Contract not found');
      }
      if (contract.clientId !== clientId) {
        throw new ForbiddenException('You do not own this project');
      }
      if (contract.project.status !== ProjectStatus.IN_PROGRESS) {
        throw new ConflictException(
          'Delivery can only be approved while the project is IN_PROGRESS',
        );
      }
      if (!contract.delivery) {
        throw new NotFoundException('Delivery not found');
      }

      const freelancerShare = contract.amount
        .mul(new Prisma.Decimal('0.90'))
        .toDecimalPlaces(2);
      const commission = contract.amount.minus(freelancerShare);
      const releasedAt = new Date();

      const released = await tx.contract.updateMany({
        where: { id: contract.id, status: ContractStatus.HELD },
        data: {
          status: ContractStatus.RELEASED,
          releasedAt,
          commission,
        },
      });
      if (released.count === 0) {
        throw new ConflictException('Contract has already been paid');
      }

      const freelancerWallet = await tx.wallet.updateMany({
        where: { userId: contract.freelancerId },
        data: { balance: { increment: freelancerShare } },
      });
      if (freelancerWallet.count === 0) {
        throw new NotFoundException('Freelancer wallet not found');
      }

      const admin = await tx.user.findFirst({
        where: { role: Role.ADMIN },
        select: { wallet: { select: { id: true } } },
      });
      if (!admin?.wallet) {
        throw new NotFoundException('Admin wallet not found');
      }
      await tx.wallet.update({
        where: { id: admin.wallet.id },
        data: { balance: { increment: commission } },
      });

      const [updatedFreelancerWallet, updatedAdminWallet] = await Promise.all([
        tx.wallet.findUniqueOrThrow({
          where: { userId: contract.freelancerId },
          select: { id: true, balance: true },
        }),
        tx.wallet.findUniqueOrThrow({
          where: { id: admin.wallet.id },
          select: { balance: true },
        }),
      ]);

      await tx.transaction.createMany({
        data: [
          {
            walletId: updatedFreelancerWallet.id,
            type: TransactionType.PAYOUT,
            amount: freelancerShare,
            balanceAfter: updatedFreelancerWallet.balance,
            contractId: contract.id,
          },
          {
            walletId: admin.wallet.id,
            type: TransactionType.COMMISSION,
            amount: commission,
            balanceAfter: updatedAdminWallet.balance,
            contractId: contract.id,
          },
        ],
      });

      await tx.project.update({
        where: { id: projectId },
        data: { status: ProjectStatus.COMPLETED },
      });

      return {
        contractId: contract.id,
        status: ContractStatus.RELEASED,
        freelancerShare,
        commission,
      };
    });
  }

  private async findActiveContractForProject(
    projectId: number,
    freelancerId: number,
  ) {
    const contract = await this.prisma.contract.findUnique({
      where: { projectId },
      select: {
        id: true,
        freelancerId: true,
        status: true,
        project: { select: { status: true } },
        delivery: { select: { filePath: true } },
      },
    });
    if (!contract) {
      throw new NotFoundException('Contract not found');
    }
    if (contract.freelancerId !== freelancerId) {
      throw new ForbiddenException(
        'Only the accepted freelancer can upload delivery',
      );
    }
    if (contract.status !== ContractStatus.HELD) {
      throw new ConflictException('Contract is no longer active');
    }
    return contract;
  }
}
