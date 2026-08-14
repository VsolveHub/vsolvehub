import type { Metadata } from "next";

import { RequestWorkspace } from "@/features/m2-requests/view/request-workspace";
import { OperationsShell } from "@/features/session/operations-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Request",
  robots: { index: false, follow: false },
};

/**
 * One request end to end.
 *
 * A server component that reads nothing: every endpoint on this screen is
 * Operations-only and cookie-authenticated, and the shell decides whether this
 * browser may see any of it. Fetching here would mean rendering a request
 * summary before the guard has run.
 */
export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ requirementId: string }>;
}) {
  const { requirementId } = await params;

  return (
    <OperationsShell>
      <RequestWorkspace requirementId={requirementId} />
    </OperationsShell>
  );
}
