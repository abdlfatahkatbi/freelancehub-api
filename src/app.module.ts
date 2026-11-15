import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { APP_GUARD } from '@nestjs/core';
import { FilesModule } from './files/files.module';
import { FreelancersModule } from './freelancers/freelancers.module';
import { AdminModule } from './admin/admin.module';
import { CacheModule } from '@nestjs/cache-manager';
import { CategoriesModule } from './categories/categories.module';
import { ProjectsModule } from './projects/projects.module';
import { ProposalsModule } from './proposals/proposals.module';
import { WalletModule } from './wallet/wallet.module';
import { DeliveriesModule } from './deliveries/deliveries.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    CacheModule.register({
      isGlobal: true,
      ttl: 86_400_000,
    }),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          name: 'login',
          limit: 5,
          ttl: 60_000,
        },
      ],
    }),
    PrismaModule,
    AuthModule,
    FilesModule,
    FreelancersModule,
    AdminModule,
    CategoriesModule,
    ProjectsModule,
    ProposalsModule,
    WalletModule,
    DeliveriesModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
