import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Cache } from '@nestjs/cache-manager';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

const CATEGORIES_CACHE_KEY = 'categories:list';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  async findAll() {
    const cached = await this.cache.get<
      Array<{ id: number; name: string }>
    >(CATEGORIES_CACHE_KEY);
    if (cached) {
      return cached;
    }

    const categories = await this.prisma.category.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    await this.cache.set(CATEGORIES_CACHE_KEY, categories);
    return categories;
  }

  async create(dto: CreateCategoryDto) {
    try {
      const category = await this.prisma.category.create({
        data: { name: this.normalizeName(dto.name) },
        select: { id: true, name: true },
      });
      await this.invalidateCache();
      return category;
    } catch (error) {
      this.throwIfDuplicate(error);
      throw error;
    }
  }

  async update(id: number, dto: UpdateCategoryDto) {
    await this.ensureCategory(id);

    try {
      const category = await this.prisma.category.update({
        where: { id },
        data:
          dto.name === undefined
            ? {}
            : { name: this.normalizeName(dto.name) },
        select: { id: true, name: true },
      });
      await this.invalidateCache();
      return category;
    } catch (error) {
      this.throwIfDuplicate(error);
      throw error;
    }
  }

  async remove(id: number) {
    await this.ensureCategory(id);
    const projectCount = await this.prisma.project.count({
      where: { categoryId: id },
    });
    if (projectCount > 0) {
      throw new ConflictException(
        'Category cannot be deleted while it has projects',
      );
    }

    try {
      await this.prisma.category.delete({ where: { id } });
      await this.invalidateCache();
      return { message: 'Category deleted successfully' };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new ConflictException(
          'Category cannot be deleted while it has projects',
        );
      }
      throw error;
    }
  }

  private async ensureCategory(id: number): Promise<void> {
    const category = await this.prisma.category.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!category) {
      throw new NotFoundException('Category not found');
    }
  }

  private async invalidateCache(): Promise<void> {
    await this.cache.del(CATEGORIES_CACHE_KEY);
  }

  private throwIfDuplicate(error: unknown): void {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('Category name already exists');
    }
  }

  private normalizeName(name: string): string {
    const normalizedName = name.trim();
    if (!normalizedName) {
      throw new BadRequestException('Category name cannot be empty');
    }
    return normalizedName;
  }
}
