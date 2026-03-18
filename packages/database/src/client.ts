import { PrismaClient } from "../prisma/generated/client/client";
import { PrismaPg } from "@prisma/adapter-pg";

const poolConfig = { connectionString: process.env.DATABASE_URL };
const adapter = new PrismaPg(poolConfig);

const prismaClientSingleton = () => {
  return new PrismaClient({
    adapter,
  });
};

type ExtendedPrismaClient = ReturnType<typeof prismaClientSingleton>;

declare global {
  var __repoDbPrisma: ExtendedPrismaClient | undefined;
}

const getPrisma = (): ExtendedPrismaClient => {
  if (globalThis.__repoDbPrisma) {
    return globalThis.__repoDbPrisma;
  }

  return prismaClientSingleton();
};

const prisma = getPrisma();

if (process.env.NODE_ENV === "development") {
  globalThis.__repoDbPrisma = prisma;
}

export { getPrisma, prisma };
