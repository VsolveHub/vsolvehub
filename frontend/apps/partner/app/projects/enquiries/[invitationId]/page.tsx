import type { Metadata } from "next";

import { EnquiryDetailScreen } from "@/features/enquiry/view/enquiry-screens";
import { PROJECT_WORKSPACE } from "@/features/workspace/registry";

/**
 * One project enquiry: read it, accept or decline it, quote it in stages
 * (`M2-FE-302`..`M2-FE-313`).
 *
 * The A5 composer is deliberately longer than the A3 one. A project quote is
 * what a customer compares against two others and what each stage is later
 * funded and released against, so the one-screen budget covers the A3 response
 * only.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Enquiry",
  robots: { index: false, follow: false },
};

export default async function ProjectEnquiryPage({
  params,
}: {
  params: Promise<{ invitationId: string }>;
}) {
  const { invitationId } = await params;

  return <EnquiryDetailScreen workspaceKey={PROJECT_WORKSPACE} invitationId={invitationId} />;
}
