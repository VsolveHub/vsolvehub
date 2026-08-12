import type { Metadata } from "next";

import { EnquiryDetailScreen } from "@/features/enquiry/view/enquiry-screens";
import { WORKFORCE_WORKSPACE } from "@/features/workspace/registry";

/**
 * One workforce enquiry: read it, accept or decline it, quote on it
 * (`M2-FE-302`..`M2-FE-313`).
 *
 * One screen by design. The flow-weight budget fixes an A3 response at a single
 * screen, so the requirement, the accept/decline pair and the rate composer are
 * one scroll rather than a three-step wizard.
 *
 * The route is workspace-scoped even though the enquiry id is globally unique.
 * That is what puts it behind `WorkspaceRoute`: a Partner whose workforce
 * capability was suspended mid-session must lose the screen, and a
 * capability-blind `/enquiries/[id]` would keep serving it.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Enquiry",
  robots: { index: false, follow: false },
};

export default async function WorkforceEnquiryPage({
  params,
}: {
  params: Promise<{ invitationId: string }>;
}) {
  const { invitationId } = await params;

  return (
    <EnquiryDetailScreen workspaceKey={WORKFORCE_WORKSPACE} invitationId={invitationId} />
  );
}
