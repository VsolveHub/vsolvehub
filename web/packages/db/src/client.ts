import { PrismaClient } from "@prisma/client";

// Postgres connection comes straight from DATABASE_URL (see prisma/schema.prisma).
// Singleton — avoids exhausting connections during Next.js dev hot-reload and
// on serverless (Vercel) where the module may be re-evaluated per invocation.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Pick the connection string for this environment.
 *
 * `DATABASE_URL` points at Supabase's transaction pooler (:6543, pgbouncer).
 * That is required in production on Vercel, where each serverless invocation is
 * short-lived and would otherwise exhaust Postgres connections.
 *
 * It is the wrong choice for local dev. Measured against this project's Supabase
 * instance from a dev machine:
 *
 *     pooled :6543 (pgbouncer)   SELECT 1  267ms   session+user  396ms
 *     direct :5432 (session)     SELECT 1   58ms   session+user  183ms
 *
 * 58ms is the raw TCP round-trip, so the pooler adds ~210ms to *every* query —
 * ~4.6x. A page issuing a handful of queries paid a second or more of pure
 * pooler overhead. `next dev` is one long-lived process holding a handful of
 * connections, which is exactly what session mode is for, so dev uses
 * `DIRECT_URL` when it is available and production stays on the pooler.
 */
function resolveDatabaseUrl(): string | undefined {
  const raw =
    process.env.NODE_ENV === "production"
      ? process.env.DATABASE_URL
      : process.env.DIRECT_URL ?? process.env.DATABASE_URL;
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

const resolvedUrl = resolveDatabaseUrl();

// One line at startup so it is obvious which connection dev actually picked.
// :5432 is the fast direct/session connection, :6543 the ~4.6x slower pooler.
if (process.env.NODE_ENV !== "production" && !globalForPrisma.prisma && resolvedUrl) {
  try {
    const { hostname, port } = new URL(resolvedUrl);
    console.log(
      `[db] ${hostname}:${port} ${port === "5432" ? "(direct — fast)" : "(pgbouncer pooler — slow, expected only in prod)"}`
    );
  } catch {
    // Malformed URL is Prisma's problem to report, not ours.
  }
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: resolvedUrl,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
