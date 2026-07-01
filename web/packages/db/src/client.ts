import { PrismaClient } from "@prisma/client";

// Postgres connection comes straight from DATABASE_URL (see prisma/schema.prisma).
// Singleton — avoids exhausting connections during Next.js dev hot-reload and
// on serverless (Vercel) where the module may be re-evaluated per invocation.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
