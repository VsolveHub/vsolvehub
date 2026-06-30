import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

/** Monorepo root (`web/`). All apps share one SQLite file at `web/data/dev.sqlite`. */
const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const canonicalDbPath = path.join(webRoot, "data", "dev.sqlite");

function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url?.startsWith("file:")) {
    return `file:${canonicalDbPath}`;
  }

  const filePath = url.slice("file:".length);
  if (path.isAbsolute(filePath)) {
    return url;
  }

  // Relative paths in app .env files differ by cwd — always use the shared dev DB.
  return `file:${canonicalDbPath}`;
}

process.env.DATABASE_URL = resolveDatabaseUrl();

// Singleton — avoids exhausting connections during Next.js dev hot-reload.
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

export * from "@prisma/client";
