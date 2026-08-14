import type { Metadata } from "next";
import Link from "next/link";

import { AssistedCapture } from "@/features/m2-requests/view/assisted-capture";
import { OperationsShell } from "@/features/session/operations-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Assisted capture",
  robots: { index: false, follow: false },
};

export default async function AssistedQuotePage({
  params,
}: {
  params: Promise<{ requirementId: string }>;
}) {
  const { requirementId } = await params;

  return (
    <OperationsShell>
      <Link
        href={`/operations/requests/${requirementId}`}
        className="text-sm font-medium text-text-link hover:underline"
      >
        &larr; Back to this request
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-text">Assisted capture</h1>
      <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
        Writing down what a vendor said on the phone, attributed to them. A captured quote is
        written unconfirmed and the customer cannot see it until the vendor confirms it themselves
        — Operations never becomes the vendor.
      </p>
      <div className="mt-6">
        <AssistedCapture requirementId={requirementId} />
      </div>
    </OperationsShell>
  );
}
