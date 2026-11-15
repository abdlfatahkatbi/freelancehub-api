import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProjectStatus, Role } from '@prisma/client';
import { FilesService } from '../files/files.service';
import type { MemoryFile } from '../files/files.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { ProjectQueryDto } from './dto/project-query.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly filesService: FilesService,
  ) {}

  async create(
    userId: number,
    dto: CreateProjectDto,
    attachment?: MemoryFile,
  ) {
    await this.ensureClient(userId);
    await this.ensureCategory(dto.categoryId);

    const attachmentPath = attachment
      ? await this.filesService.save(attachment, 'attachment')
      : undefined;

    try {
      return await this.prisma.project.create({
        data: {
          title: this.normalizeText(dto.title, 'Project title'),
          description: this.normalizeText(
            dto.description,
            'Project description',
          ),
          categoryId: dto.categoryId,
          budget: new Prisma.Decimal(dto.budget),
          clientId: userId,
          ...(attachmentPath
            ? {
                attachmentPath,
                attachmentMime: attachment?.mimetype,
              }
            : {}),
        },
        select: this.projectSelect,
      });
    } catch (error) {
      if (attachmentPath) {
        await this.filesService.delete(attachmentPath);
      }
      this.throwProjectError(error);
    }
  }

  async findAll(query: ProjectQueryDto) {
    const { page, limit, categoryId, search, sort } = query;
    const where: Prisma.ProjectWhereInput = {
      ...(categoryId ? { categoryId } : {}),
      ...(search?.trim()
        ? { title: { contains: search.trim(), mode: 'insensitive' } }
        : {}),
    };
    const orderBy =
      sort === 'budget_asc'
        ? { budget: 'asc' as const }
        : sort === 'budget_desc'
          ? { budget: 'desc' as const }
          : { createdAt: 'desc' as const };

    return this.paginate(where, page, limit, orderBy);
  }

  async findMine(userId: number, query: ProjectQueryDto) {
    await this.ensureClient(userId);
    return this.paginate(
      { clientId: userId },
      query.page,
      query.limit,
      { createdAt: 'desc' },
    );
  }

  async findOne(id: number) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      select: this.projectSelect,
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    return project;
  }

  async update(
    userId: number,
    id: number,
    dto: UpdateProjectDto,
    attachment?: MemoryFile,
  ) {
    const project = await this.findOwnedOpenProject(userId, id);
    if (dto.categoryId !== undefined) {
      await this.ensureCategory(dto.categoryId);
    }

    const newAttachmentPath = attachment
      ? await this.filesService.save(attachment, 'attachment')
      : undefined;
    const data: Prisma.ProjectUpdateInput = {
      ...(dto.title !== undefined
        ? { title: this.normalizeText(dto.title, 'Project title') }
        : {}),
      ...(dto.description !== undefined
        ? {
            description: this.normalizeText(
              dto.description,
              'Project description',
            ),
          }
        : {}),
      ...(dto.categoryId !== undefined
        ? { category: { connect: { id: dto.categoryId } } }
        : {}),
      ...(dto.budget !== undefined
        ? { budget: new Prisma.Decimal(dto.budget) }
        : {}),
      ...(newAttachmentPath
        ? {
            attachmentPath: newAttachmentPath,
            attachmentMime: attachment?.mimetype,
          }
        : {}),
    };

    try {
      const updated = await this.prisma.project.update({
        where: { id },
        data,
        select: this.projectSelect,
      });
      if (newAttachmentPath && project.attachmentPath) {
        await this.filesService.delete(project.attachmentPath);
      }
      return updated;
    } catch (error) {
      if (newAttachmentPath) {
        await this.filesService.delete(newAttachmentPath);
      }
      this.throwProjectError(error);
    }
  }

  async remove(userId: number, id: number) {
    const project = await this.findOwnedOpenProject(userId, id);
    try {
      await this.prisma.project.delete({ where: { id } });
      if (project.attachmentPath) {
        await this.filesService.delete(project.attachmentPath);
      }
      return { message: 'Project deleted successfully' };
    } catch (error) {
      this.throwProjectError(error);
    }
  }

  async downloadAttachment(id: number) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      select: { attachmentPath: true, attachmentMime: true },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    if (!project.attachmentPath || !project.attachmentMime) {
      throw new NotFoundException('Project attachment not found');
    }
    return {
      buffer: await this.filesService.read(project.attachmentPath),
      mime: project.attachmentMime,
    };
  }

  private async paginate(
    where: Prisma.ProjectWhereInput,
    page: number,
    limit: number,
    orderBy: Prisma.ProjectOrderByWithRelationInput,
  ) {
    const [total, data] = await this.prisma.$transaction([
      this.prisma.project.count({ where }),
      this.prisma.project.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy,
        select: this.projectSelect,
      }),
    ]);
    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  private async findOwnedOpenProject(userId: number, id: number) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      select: { id: true, clientId: true, status: true, attachmentPath: true },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    if (project.clientId !== userId) {
      throw new ForbiddenException('You do not own this project');
    }
    if (project.status !== ProjectStatus.OPEN) {
      throw new ConflictException('Project can only be changed while OPEN');
    }
    return project;
  }

  private async ensureClient(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!user || user.role !== Role.CLIENT) {
      throw new ForbiddenException('Only clients can manage projects');
    }
  }

  private async ensureCategory(categoryId: number) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true },
    });
    if (!category) {
      throw new NotFoundException('Category not found');
    }
  }

  private throwProjectError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2003'
    ) {
      throw new NotFoundException('Category not found');
    }
    throw error;
  }

  private normalizeText(value: string, field: string): string {
    const normalized = value.trim();
    if (!normalized) {
      throw new BadRequestException(`${field} cannot be empty`);
    }
    return normalized;
  }

  private readonly projectSelect = {
    id: true,
    title: true,
    description: true,
    budget: true,
    status: true,
    attachmentPath: true,
    attachmentMime: true,
    createdAt: true,
    clientId: true,
    category: { select: { id: true, name: true } },
  } satisfies Prisma.ProjectSelect;
}
