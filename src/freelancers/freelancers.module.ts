import { Module } from '@nestjs/common';
import { FreelancersController } from './freelancers.controller';
import { FreelancersService } from './freelancers.service';
import { PrismaModule } from '../prisma/prisma.module';
import { FilesModule } from '../files/files.module';

@Module({
  imports: [PrismaModule, FilesModule],
  controllers: [FreelancersController],
  providers: [FreelancersService],
})
export class FreelancersModule {}
