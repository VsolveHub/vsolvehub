// Ported from frontend/apps/customer/features/catalog/recently-viewed.ts
import { kvGet, kvSet } from "@vsolve/mobile-core";

const STORAGE_KEY = "recently-viewed-services";
export const RECENTLY_VIEWED_LIMIT = 6;

export interface ViewedService {
  slug: string;
  name: string;
  href: string;
}

export function withViewed(
  history: readonly ViewedService[],
  entry: ViewedService,
  limit: number = RECENTLY_VIEWED_LIMIT,
): ViewedService[] {
  const rest = history.filter((viewed) => viewed.slug !== entry.slug);
  return [entry, ...rest].slice(0, limit);
}

function isViewedService(value: unknown): value is ViewedService {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.slug === "string" && typeof candidate.name === "string" && typeof candidate.href === "string";
}

function parseViewed(raw: string | null): ViewedService[] {
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isViewedService).slice(0, RECENTLY_VIEWED_LIMIT);
  } catch {
    return [];
  }
}

export async function recordViewed(entry: ViewedService): Promise<void> {
  try {
    const next = withViewed(parseViewed(await kvGet(STORAGE_KEY)), entry);
    await kvSet(STORAGE_KEY, JSON.stringify(next));
  } catch {
    return;
  }
}
