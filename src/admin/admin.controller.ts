import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminService } from './admin.service';
import { PaginationDto } from './dto/pagination.dto';

@ApiTags('admin')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('users')
  listUsers(@Query() pagination: PaginationDto) {
    return this.adminService.listUsers(pagination);
  }

  @Patch('users/:id/ban')
  banUser(@Param('id', ParseIntPipe) id: number) {
    return this.adminService.banUser(id);
  }

  @Patch('users/:id/unban')
  unbanUser(@Param('id', ParseIntPipe) id: number) {
    return this.adminService.unbanUser(id);
  }
}
