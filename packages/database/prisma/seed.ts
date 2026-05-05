import { PrismaClient } from '@prisma/client';

// Boilerplate seed — no-op because the baseline schema has no models yet.
// Real features add their own seed entries once their models exist.

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.warn('Seed: no models to seed (baseline boilerplate).');
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
