import { ValidationPipe } from '@nestjs/common';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ContractStatus, ProjectStatus, ProposalStatus, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';
import request from 'supertest';
import type { App } from 'supertest/types';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error(
    'TEST_DATABASE_URL must point to an isolated PostgreSQL database for e2e tests',
  );
}
process.env.DATABASE_URL = testDatabaseUrl;

describe('FreelanceHub acceptance scenario (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: import('../src/prisma/prisma.service').PrismaService;
  let AppModule: typeof import('../src/app.module').AppModule;

  beforeAll(async () => {
    ({ AppModule } = await import('../src/app.module'));
    const { PrismaService } = await import('../src/prisma/prisma.service');
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    await cleanDatabase();
  });

  afterAll(async () => {
    const deliveries = await prisma.delivery.findMany({
      select: { filePath: true },
    });
    for (const delivery of deliveries) {
      await fs.rm(resolve(process.cwd(), delivery.filePath), { force: true });
    }
    await cleanDatabase();
    await app.close();
  });

  it('runs the complete section 8 acceptance scenario', async () => {
    const category = await prisma.category.create({
      data: { name: `Design-${Date.now()}` },
    });
    const adminPassword = 'admin-password-123';
    const admin = await prisma.user.create({
      data: {
        name: 'Test Admin',
        email: `admin-${Date.now()}@example.com`,
        password: await bcrypt.hash(adminPassword, 10),
        role: Role.ADMIN,
        wallet: { create: {} },
      },
    });

    const sara = await register('Sara', 'sara@example.com', 'CLIENT');
    const ahmed = await register('Ahmed', 'ahmed@example.com', 'FREELANCER');
    const layla = await register('Layla', 'layla@example.com', 'FREELANCER');
    const bob = await register('Bob', 'bob@example.com', 'CLIENT');
    const adminToken = await login(admin.email, adminPassword);

    await request(app.getHttpServer())
      .post('/wallet/deposit')
      .set('Authorization', bearer(sara.token))
      .send({ amount: '300.00' })
      .expect(201)
      .expect(({ body }) => expect(String(body.balance)).toBe('300'));

    const walletAfterDeposit = await request(app.getHttpServer())
      .get('/wallet')
      .set('Authorization', bearer(sara.token))
      .expect(200);
    expect(String(walletAfterDeposit.body.balance)).toBe('300');

    const projectResponse = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', bearer(sara.token))
      .field('title', 'logo design')
      .field('description', 'Create a modern logo')
      .field('categoryId', String(category.id))
      .field('budget', '300.00')
      .expect(201);
    const projectId = projectResponse.body.id as number;

    const ahmedProposal = await createProposal(projectId, ahmed.token, '200.00');
    await request(app.getHttpServer())
      .post(`/projects/${projectId}/proposals`)
      .set('Authorization', bearer(ahmed.token))
      .send({
        price: '210.00',
        durationDays: 5,
        message: 'A duplicate proposal',
      })
      .expect(409);

    await createProposal(projectId, layla.token, '220.00');

    await request(app.getHttpServer())
      .post(`/proposals/${ahmedProposal.id}/accept`)
      .set('Authorization', bearer(sara.token))
      .expect(201)
      .expect(({ body }) => {
        expect(body.status).toBe(ContractStatus.HELD);
        expect(String(body.amount)).toBe('200');
      });

    const balanceAfterAccept = await getBalance(sara.token);
    expect(balanceAfterAccept).toBe('100');
    expect(
      (await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).status,
    ).toBe(ProjectStatus.IN_PROGRESS);
    expect(
      (
        await prisma.proposal.findUniqueOrThrow({
          where: { id: ahmedProposal.id },
        })
      ).status,
    ).toBe(ProposalStatus.ACCEPTED);
    expect(
      (
        await prisma.proposal.findFirstOrThrow({
          where: { projectId, freelancerId: layla.userId },
        })
      ).status,
    ).toBe(ProposalStatus.REJECTED);

    const insufficientProject = await createProject(
      sara.token,
      category.id,
      'insufficient funds project',
    );
    const insufficientProposal = await createProposal(
      insufficientProject.id,
      layla.token,
      '200.00',
    );
    await request(app.getHttpServer())
      .post(`/proposals/${insufficientProposal.id}/accept`)
      .set('Authorization', bearer(sara.token))
      .expect(400);
    expect(await getBalance(sara.token)).toBe('100');
    expect(
      (await prisma.project.findUniqueOrThrow({
        where: { id: insufficientProject.id },
      })).status,
    ).toBe(ProjectStatus.OPEN);
    expect(
      (await prisma.proposal.findUniqueOrThrow({
        where: { id: insufficientProposal.id },
      })).status,
    ).toBe(ProposalStatus.PENDING);

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/delivery`)
      .set('Authorization', bearer(ahmed.token))
      .attach(
        'file',
        Buffer.from('%PDF-1.7 test delivery'),
        'delivery.pdf',
      )
      .expect(201);

    for (const token of [sara.token, ahmed.token]) {
      await request(app.getHttpServer())
        .get(`/projects/${projectId}/delivery`)
        .set('Authorization', bearer(token))
        .expect(200)
        .expect('Content-Type', /application\/pdf/);
    }

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/delivery/approve`)
      .set('Authorization', bearer(sara.token))
      .expect(201)
      .expect(({ body }) => {
        expect(body.status).toBe(ContractStatus.RELEASED);
        expect(String(body.freelancerShare)).toBe('180');
        expect(String(body.commission)).toBe('20');
      });
    expect(await getBalance(ahmed.token)).toBe('180');
    const adminWallet = await prisma.wallet.findUniqueOrThrow({
      where: { userId: admin.id },
    });
    expect(String(adminWallet.balance)).toBe('20');
    expect(
      (await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).status,
    ).toBe(ProjectStatus.COMPLETED);
    expect(
      (await prisma.contract.findUniqueOrThrow({ where: { projectId } })).status,
    ).toBe(ContractStatus.RELEASED);
    expect(
      await prisma.transaction.count({
        where: { type: 'PAYOUT', contract: { projectId } },
      }),
    ).toBe(1);
    expect(
      await prisma.transaction.count({
        where: { type: 'COMMISSION', contract: { projectId } },
      }),
    ).toBe(1);

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/delivery/approve`)
      .set('Authorization', bearer(sara.token))
      .expect(409);
    expect(await getBalance(ahmed.token)).toBe('180');

    await request(app.getHttpServer())
      .patch(`/proposals/${(await prisma.proposal.findFirstOrThrow({
        where: { projectId, freelancerId: layla.userId },
      })).id}`)
      .set('Authorization', bearer(ahmed.token))
      .send({ message: 'Unauthorized edit' })
      .expect(403);

    const otherProject = await createProject(
      bob.token,
      category.id,
      'another client project',
    );
    await request(app.getHttpServer())
      .patch(`/projects/${otherProject.id}`)
      .set('Authorization', bearer(sara.token))
      .field('title', 'unauthorized edit')
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/admin/users/${ahmed.userId}/ban`)
      .set('Authorization', bearer(adminToken))
      .expect(200);
    await request(app.getHttpServer())
      .get('/wallet')
      .set('Authorization', bearer(ahmed.token))
      .expect(401);

    const throttleApp = await createApp();
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await request(throttleApp.getHttpServer())
        .post('/auth/login')
        .send({ email: 'invalid@example.com', password: 'wrong-password' })
        .expect(401);
    }
    await request(throttleApp.getHttpServer())
      .post('/auth/login')
      .send({ email: 'invalid@example.com', password: 'wrong-password' })
      .expect(429);
    await throttleApp.close();
  });

  async function createApp() {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const testApp = moduleFixture.createNestApplication();
    testApp.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await testApp.init();
    return testApp;
  }

  async function register(
    name: string,
    email: string,
    role: 'CLIENT' | 'FREELANCER',
  ) {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        name,
        email: `${Date.now()}-${email}`,
        password: 'password-123',
        role,
      })
      .expect(201);
    return {
      token: response.body.accessToken as string,
      userId: response.body.user.id as number,
    };
  }

  async function login(email: string, password: string) {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    return response.body.accessToken as string;
  }

  async function createProposal(
    projectId: number,
    token: string,
    price: string,
  ) {
    const response = await request(app.getHttpServer())
      .post(`/projects/${projectId}/proposals`)
      .set('Authorization', bearer(token))
      .send({
        price,
        durationDays: 7,
        message: 'I can deliver this project.',
      })
      .expect(201);
    return response.body as { id: number };
  }

  async function createProject(token: string, categoryId: number, title: string) {
    const response = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', bearer(token))
      .field('title', title)
      .field('description', 'Project description')
      .field('categoryId', String(categoryId))
      .field('budget', '300.00')
      .expect(201);
    return response.body as { id: number };
  }

  async function getBalance(token: string) {
    const response = await request(app.getHttpServer())
      .get('/wallet')
      .set('Authorization', bearer(token))
      .expect(200);
    return String(response.body.balance);
  }

  async function cleanDatabase() {
    await prisma.$transaction([
      prisma.delivery.deleteMany(),
      prisma.transaction.deleteMany(),
      prisma.contract.deleteMany(),
      prisma.proposal.deleteMany(),
      prisma.project.deleteMany(),
      prisma.category.deleteMany(),
      prisma.freelancerProfile.deleteMany(),
      prisma.wallet.deleteMany(),
      prisma.user.deleteMany(),
    ]);
  }

  function bearer(token: string) {
    return `Bearer ${token}`;
  }
});
