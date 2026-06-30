import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { RECENTLY_VIEWED_COOKIE } from "@/lib/constants";
import {
  buildRecentlyViewedValue,
  getRecentlyViewedIds,
  recentlyViewedCookieOptions,
} from "@/lib/recently-viewed";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const serviceId = body?.serviceId;

  if (!serviceId || typeof serviceId !== "string") {
    return NextResponse.json({ error: "serviceId required" }, { status: 400 });
  }

  const recentIds = await getRecentlyViewedIds();
  const cookieStore = await cookies();
  cookieStore.set(
    RECENTLY_VIEWED_COOKIE,
    buildRecentlyViewedValue(recentIds, serviceId),
    recentlyViewedCookieOptions()
  );

  return NextResponse.json({ ok: true });
}
