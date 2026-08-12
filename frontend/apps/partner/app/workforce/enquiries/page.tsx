import type { Metadata } from "next";

import { EnquiryListScreen } from "@/features/enquiry/view/enquiry-screens";
import { WORKFORCE_WORKSPACE } from "@/features/workspace/registry";

/**
 * Workforce enquiries — customers asking for people by the day (`M2-FE-301`).
 *
 * Shares `GET /api/v1/partner/enquiries/` with the project list and not a
 * screen. The endpoint returns every invitation this Partner holds across both
 * lifecycles; each workspace shows the ones whose `archetype` matches the grant
 * it was authorized under, because an A3 vendor answers with a rate per worker
 * per day and an A5 vendor answers with staged deliverables.
 *
 * `force-dynamic`, never indexed — like every authenticated Partner route.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Enquiries",
  robots: { index: false, follow: false },
};

export default function WorkforceEnquiriesPage() {
  return <EnquiryListScreen workspaceKey={WORKFORCE_WORKSPACE} />;
}
