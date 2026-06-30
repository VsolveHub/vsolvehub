import { cookies } from "next/headers";
import { RECENTLY_VIEWED_COOKIE, RECENTLY_VIEWED_MAX } from "@/lib/constants";

export async function getRecentlyViewedIds(): Promise<string[]> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(RECENTLY_VIEWED_COOKIE)?.value;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function recentlyViewedCookieOptions() {
  return {
    httpOnly: false,
    path: "/",
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 30,
  };
}

export function buildRecentlyViewedValue(existing: string[], serviceId: string) {
  const next = [serviceId, ...existing.filter((id) => id !== serviceId)].slice(
    0,
    RECENTLY_VIEWED_MAX
  );
  return JSON.stringify(next);
}
