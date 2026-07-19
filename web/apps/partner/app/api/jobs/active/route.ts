import { NextResponse } from "next/server";
import { getCurrentPartner } from "@/lib/auth";
import { getPartnerActiveJobs } from "@vsolve/db";

/**
 * GET /api/jobs/active
 *
 * A tiny change-token for the partner's current active job — `"<id>:<status>"`
 * or `"idle"`. The dashboard polls this and calls router.refresh() only when the
 * token changes, so a directly-assigned job (and every status change) appears
 * without a reload while re-using the page's existing server serialization.
 * Deliberately returns no job detail — the refresh fetches that.
 */
export async function GET() {
  const partner = await getCurrentPartner();
  if (!partner) return NextResponse.json({ token: "idle" });

  const [job] = await getPartnerActiveJobs(partner.id);
  return NextResponse.json({ token: job ? `${job.id}:${job.status}` : "idle" });
}
