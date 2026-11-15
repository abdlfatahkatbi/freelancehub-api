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
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CreateProposalDto } from './dto/create-proposal.dto';
import { ProposalQueryDto } from './dto/proposal-query.dto';
import { UpdateProposalDto } from './dto/update-proposal.dto';
import { ProposalsService } from './proposals.service';

@ApiTags('proposals')
@ApiBearerAuth()
@Controller()
export class ProposalsController {
  constructor(private readonly proposalsService: ProposalsService) {}

  @Roles(Role.FREELANCER)
  @Post('projects/:projectId/proposals')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() dto: CreateProposalDto,
  ) {
    return this.proposalsService.create(user.id, projectId, dto);
  }

  @Get('projects/:projectId/proposals')
  findForProject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseIntPipe) projectId: number,
  ) {
    return this.proposalsService.findForProject(user.id, projectId);
  }

  @Roles(Role.FREELANCER)
  @Get('proposals/mine')
  findMine(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ProposalQueryDto,
  ) {
    return this.proposalsService.findMine(user.id, query);
  }

  @Roles(Role.FREELANCER)
  @Patch('proposals/:id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProposalDto,
  ) {
    return this.proposalsService.update(user.id, id, dto);
  }

  @Roles(Role.FREELANCER)
  @Delete('proposals/:id')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.proposalsService.remove(user.id, id);
  }
}
