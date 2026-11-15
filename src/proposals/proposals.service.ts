import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProposalStatus, ProjectStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProposalDto } from './dto/create-proposal.dto';
import { ProposalQueryDto } from './dto/proposal-query.dto';
import { UpdateProposalDto } from './dto/update-proposal.dto';

@Injectable()
export class ProposalsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    freelancerId: number,
    projectId: number,
    dto: CreateProposalDto,
  ) {
    await this.ensureFreelancer(freelancerId);
    await this.ensureOpenProject(projectId);
    const price = this.toPositiveDecimal(dto.price);
    const message = this.normalizeMessage(dto.message);

    try {
      return await this.prisma.$transaction(async (tx) => {
        return tx.proposal.create({
          data: {
            price,
            durationDays: dto.durationDays,
            message,
            projectId,
            freelancerId,
          },
          select: this.proposalSelect,
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'You already submitted a proposal for this project',
        );
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new NotFoundException('Project or freelancer not found');
      }
      throw error;
    }
  }

  async findForProject(clientId: number, projectId: number) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { clientId: true },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    if (project.clientId !== clientId) {
      throw new ForbiddenException(
        'Only the project owner can view its proposals',
      );
    }

    return this.prisma.proposal.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      select: this.proposalSelect,
    });
  }

  async findMine(freelancerId: number, query: ProposalQueryDto) {
    await this.ensureFreelancer(freelancerId);
    return this.prisma.proposal.findMany({
      where: {
        freelancerId,
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      select: this.proposalSelect,
    });
  }

  async update(
    freelancerId: number,
    id: number,
    dto: UpdateProposalDto,
  ) {
    await this.ensureFreelancer(freelancerId);
    await this.ensureOwnPendingProposal(freelancerId, id);
    const price =
      dto.price !== undefined ? this.toPositiveDecimal(dto.price) : undefined;
    const message =
      dto.message !== undefined
        ? this.normalizeMessage(dto.message)
        : undefined;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.proposal.updateMany({
        where: {
          id,
          freelancerId,
          status: ProposalStatus.PENDING,
          project: { status: ProjectStatus.OPEN },
        },
        data: {
          ...(price !== undefined ? { price } : {}),
          ...(dto.durationDays !== undefined
            ? { durationDays: dto.durationDays }
            : {}),
          ...(message !== undefined ? { message } : {}),
        },
      });
      if (updated.count === 0) {
        throw new ConflictException(
          'Proposal can only be changed while PENDING and the project is OPEN',
        );
      }

      return tx.proposal.findUniqueOrThrow({
        where: { id },
        select: this.proposalSelect,
      });
    });
  }

  async remove(freelancerId: number, id: number) {
    await this.ensureFreelancer(freelancerId);
    await this.ensureOwnPendingProposal(freelancerId, id);

    await this.prisma.proposal.delete({ where: { id } });
    return { message: 'Proposal deleted successfully' };
  }

  async accept(clientId: number, proposalId: number) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const proposal = await tx.proposal.findUnique({
        where: { id: proposalId },
        select: {
          id: true,
          price: true,
          freelancerId: true,
          status: true,
          project: {
            select: { id: true, clientId: true, status: true },
          },
        },
        });
        if (!proposal) {
          throw new NotFoundException('Proposal not found');
        }
        if (proposal.project.clientId !== clientId) {
          throw new ForbiddenException('You do not own this project');
        }
        if (proposal.project.status !== ProjectStatus.OPEN) {
          throw new ConflictException('Project is no longer OPEN');
        }
        if (proposal.status !== ProposalStatus.PENDING) {
          throw new ConflictException('Proposal is no longer PENDING');
        }

        const wallet = await tx.wallet.findUnique({
        where: { userId: clientId },
        select: { id: true },
        });
        if (!wallet) {
          throw new NotFoundException('Wallet not found');
        }
        const deducted = await tx.wallet.updateMany({
        where: {
          userId: clientId,
          balance: { gte: proposal.price },
        },
        data: { balance: { decrement: proposal.price } },
        });
        if (deducted.count === 0) {
          throw new BadRequestException('Insufficient balance');
        }

        const projectLocked = await tx.project.updateMany({
        where: { id: proposal.project.id, status: ProjectStatus.OPEN },
        data: { status: ProjectStatus.IN_PROGRESS },
        });
        if (projectLocked.count === 0) {
          throw new ConflictException(
            'Project was accepted by another proposal',
          );
        }

        const updatedWallet = await tx.wallet.findUniqueOrThrow({
        where: { id: wallet.id },
        select: { balance: true },
        });
        const contract = await tx.contract.create({
        data: {
          amount: proposal.price,
          projectId: proposal.project.id,
          proposalId: proposal.id,
          clientId,
          freelancerId: proposal.freelancerId,
        },
        select: {
          id: true,
          amount: true,
          status: true,
          projectId: true,
          proposalId: true,
          clientId: true,
          freelancerId: true,
        },
        });
        await tx.proposal.update({
        where: { id: proposal.id },
        data: { status: ProposalStatus.ACCEPTED },
        });
        await tx.proposal.updateMany({
        where: {
          projectId: proposal.project.id,
          id: { not: proposal.id },
        },
        data: { status: ProposalStatus.REJECTED },
        });
        await tx.transaction.create({
        data: {
          walletId: wallet.id,
          type: 'ESCROW_HOLD',
          amount: proposal.price.neg(),
          balanceAfter: updatedWallet.balance,
          contractId: contract.id,
        },
        });

        return contract;
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034'
      ) {
        throw new ConflictException(
          'Proposal changed while it was being accepted; please try again',
        );
      }
      throw error;
    }
  }

  private async ensureFreelancer(freelancerId: number): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: freelancerId },
      select: { role: true },
    });
    if (!user || user.role !== Role.FREELANCER) {
      throw new ForbiddenException('Only freelancers can manage proposals');
    }
  }

  private async ensureOpenProject(projectId: number): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { status: true },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    if (project.status !== ProjectStatus.OPEN) {
      throw new ConflictException(
        'Proposals can only be submitted while the project is OPEN',
      );
    }
  }

  private async ensureOwnPendingProposal(
    freelancerId: number,
    id: number,
  ): Promise<void> {
    const proposal = await this.prisma.proposal.findUnique({
      where: { id },
      select: {
        freelancerId: true,
        status: true,
        project: { select: { status: true } },
      },
    });
    if (!proposal) {
      throw new NotFoundException('Proposal not found');
    }
    if (proposal.freelancerId !== freelancerId) {
      throw new ForbiddenException('You do not own this proposal');
    }
    if (
      proposal.status !== ProposalStatus.PENDING ||
      proposal.project.status !== ProjectStatus.OPEN
    ) {
      throw new ConflictException(
        'Proposal can only be changed while PENDING and the project is OPEN',
      );
    }
  }

  private toPositiveDecimal(value: string): Prisma.Decimal {
    try {
      const decimal = new Prisma.Decimal(value);
      if (decimal.lte(0)) {
        throw new BadRequestException('Proposal price must be greater than 0');
      }
      return decimal;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Proposal price must be a valid amount');
    }
  }

  private normalizeMessage(value: string): string {
    const message = value.trim();
    if (!message) {
      throw new BadRequestException('Proposal message cannot be empty');
    }
    return message;
  }

  private readonly proposalSelect = {
    id: true,
    price: true,
    durationDays: true,
    message: true,
    status: true,
    createdAt: true,
    projectId: true,
    freelancer: {
      select: {
        id: true,
        name: true,
      },
    },
  } satisfies Prisma.ProposalSelect;
}
