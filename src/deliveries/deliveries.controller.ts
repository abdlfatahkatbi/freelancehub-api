import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
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
import { DeliveriesService } from './deliveries.service';

@ApiTags('deliveries')
@ApiBearerAuth()
@Controller('projects/:projectId/delivery')
export class DeliveriesController {
  constructor(private readonly deliveriesService: DeliveriesService) {}

  @Roles(Role.FREELANCER)
  @Post()
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
      required: ['file'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseIntPipe) projectId: number,
    @UploadedFile() file: MemoryFile | undefined,
  ) {
    return this.deliveriesService.upload(user.id, projectId, file);
  }

  @Get()
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseIntPipe) projectId: number,
    @Res() response: Response,
  ) {
    const file = await this.deliveriesService.download(user.id, projectId);
    response.type(file.mime).send(file.buffer);
  }

  @Roles(Role.CLIENT)
  @Post('approve')
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseIntPipe) projectId: number,
  ) {
    return this.deliveriesService.approve(user.id, projectId);
  }
}
