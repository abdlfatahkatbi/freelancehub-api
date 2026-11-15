import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} must be configured before running the seed`);
  }
  return value;
}

const adminEmail = requiredEnv('ADMIN_EMAIL').toLowerCase();
const adminPassword = requiredEnv('ADMIN_PASSWORD');
const adminName = process.env.ADMIN_NAME?.trim() || 'FreelanceHub Admin';

async function main(): Promise<void> {
  const hashedPassword = await bcrypt.hash(adminPassword, 10);

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      name: adminName,
      password: hashedPassword,
      role: Role.ADMIN,
      wallet: {
        upsert: {
          create: {},
          update: {},
        },
      },
    },
    create: {
      name: adminName,
      email: adminEmail,
      password: hashedPassword,
      role: Role.ADMIN,
      wallet: {
        create: {},
      },
    },
  });

  for (const name of [
    'Programming',
    'Design',
    'Translation',
    'Marketing',
  ]) {
    await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  console.log(`Seeded admin ${adminEmail} and default categories`);
}

main()
  .catch((error: unknown) => {
    console.error('Database seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
