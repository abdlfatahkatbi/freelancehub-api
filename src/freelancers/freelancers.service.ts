import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FilesService, MemoryFile } from '../files/files.service';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class FreelancersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly filesService: FilesService,
  ) {}

  async getPublicProfile(id: number) {
    const user = await this.prisma.user.findFirst({
      where: { id, role: 'FREELANCER' },
      select: {
        id: true,
        name: true,
        profile: {
          select: {
            avatarPath: true,
            bio: true,
            hourlyRate: true,
          },
        },
      },
    });

    if (!user || !user.profile) {
      throw new NotFoundException('Freelancer not found');
    }

    return {
      id: user.id,
      name: user.name,
      avatarUrl: user.profile.avatarPath,
      bio: user.profile.bio,
      hourlyRate: user.profile.hourlyRate,
    };
  }

  async updateOwnProfile(userId: number, dto: UpdateProfileDto) {
    await this.ensureFreelancer(userId);

    return this.prisma.freelancerProfile.update({
      where: { userId },
      data: {
        ...(dto.bio !== undefined ? { bio: dto.bio } : {}),
        ...(dto.hourlyRate !== undefined
          ? { hourlyRate: new Prisma.Decimal(dto.hourlyRate) }
          : {}),
      },
      select: {
        bio: true,
        hourlyRate: true,
        avatarPath: true,
      },
    });
  }

  async updateOwnAvatar(userId: number, file: MemoryFile | undefined) {
    await this.ensureFreelancer(userId);
    if (!file) {
      throw new BadRequestException('Avatar file is required');
    }

    const storedPath = await this.filesService.save(file, 'avatar');
    const profile = await this.prisma.freelancerProfile.update({
      where: { userId },
      data: { avatarPath: storedPath },
      select: { avatarPath: true },
    });

    return {
      avatarUrl: profile.avatarPath,
    };
  }

  private async ensureFreelancer(userId: number): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, profile: { select: { userId: true } } },
    });
    if (!user || user.role !== 'FREELANCER' || !user.profile) {
      throw new NotFoundException('Freelancer profile not found');
    }
  }
}
