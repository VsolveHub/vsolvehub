import type { Metadata } from "next";
import Link from "next/link";

import { AssistedCapture } from "@/features/m2-requests/view/assisted-capture";


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
    <>
      <Link
        href={`/operations/requests/${requirementId}`}
        className="text-sm font-medium text-text-link hover:underline"
      >
        &larr; Back to this request
      </Link>
      <div className="mt-6">
        <AssistedCapture requirementId={requirementId} />
      </div>
    </>
  );
}
