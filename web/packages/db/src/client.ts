import { PrismaClient } from "@prisma/client";

// Postgres connection comes straight from DATABASE_URL (see prisma/schema.prisma).
// Singleton — avoids exhausting connections during Next.js dev hot-reload and
// on serverless (Vercel) where the module may be re-evaluated per invocation.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Ensure a workable connection pool. Pages like the partner dashboard fan out
 * ~8 queries per request via `Promise.all`; with `connection_limit=1` they all
 * queue behind a single pooled connection — which is slow (10s+ page loads) and
 * trips Prisma's pool-acquire timeout (P2024). We raise the pool to a small
 * parallel count and lengthen the acquire timeout. Safe with the Supabase
 * transaction pooler, which multiplexes these onto its own Postgres pool.
 */
function pooledDatabaseUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    const limit = Number(url.searchParams.get("connection_limit"));
    if (!Number.isFinite(limit) || limit < 5) url.searchParams.set("connection_limit", "5");
    if (!url.searchParams.has("pool_timeout")) url.searchParams.set("pool_timeout", "20");
    return url.toString();
  } catch {
    return raw;
  }
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: pooledDatabaseUrl(),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
