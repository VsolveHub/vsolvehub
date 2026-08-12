import type { Metadata } from "next";

import { EnquiryListScreen } from "@/features/enquiry/view/enquiry-screens";
import { PROJECT_WORKSPACE } from "@/features/workspace/registry";

/**
 * Project enquiries — customers commissioning a finished result (`M2-FE-301`).
 *
 * Shares an endpoint with the workforce enquiry list and not a screen: an A5
 * vendor answers with a staged proposal (`M2-FE-309`) where an A3 vendor answers
 * with a rate per worker per day (`M2-FE-308`).
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Enquiries",
  robots: { index: false, follow: false },
};

export default function ProjectEnquiriesPage() {
  return <EnquiryListScreen workspaceKey={PROJECT_WORKSPACE} />;
}
