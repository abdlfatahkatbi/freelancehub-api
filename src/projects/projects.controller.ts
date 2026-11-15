import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { MemoryFile } from '../files/files.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { ProjectQueryDto } from './dto/project-query.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectsService } from './projects.service';

@ApiTags('projects')
@ApiBearerAuth()
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Roles(Role.CLIENT)
  @Post()
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        categoryId: { type: 'integer' },
        budget: { type: 'string' },
        attachment: { type: 'string', format: 'binary' },
      },
      required: ['title', 'description', 'categoryId', 'budget'],
    },
  })
  @UseInterceptors(
    FileInterceptor('attachment', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateProjectDto,
    @UploadedFile() attachment: MemoryFile | undefined,
  ) {
    return this.projectsService.create(user.id, dto, attachment);
  }

  @Get()
  findAll(@Query() query: ProjectQueryDto) {
    return this.projectsService.findAll(query);
  }

  @Get('mine')
  @Roles(Role.CLIENT)
  findMine(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ProjectQueryDto,
  ) {
    return this.projectsService.findMine(user.id, query);
  }

  @Get(':id/attachment')
  async downloadAttachment(
    @Param('id', ParseIntPipe) id: number,
    @Res() response: Response,
  ) {
    const file = await this.projectsService.downloadAttachment(id);
    response.type(file.mime).send(file.buffer);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.projectsService.findOne(id);
  }

  @Roles(Role.CLIENT)
  @Patch(':id')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        categoryId: { type: 'integer' },
        budget: { type: 'string' },
        attachment: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('attachment', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProjectDto,
    @UploadedFile() attachment: MemoryFile | undefined,
  ) {
    return this.projectsService.update(user.id, id, dto, attachment);
  }

  @Roles(Role.CLIENT)
  @Delete(':id')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.projectsService.remove(user.id, id);
  }
}
