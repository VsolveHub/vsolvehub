import type { Metadata } from "next";

import { ConfirmChoiceScreen } from "@/features/quotes/view/confirm-choice-screen";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Confirm your choice",
  robots: { index: false, follow: false },
};

export default async function ConfirmChoicePage({
  params,
}: {
  params: Promise<{ requirementId: string; proposalId: string }>;
}) {
  const { requirementId, proposalId } = await params;
  return (
    <main>
      <ConfirmChoiceScreen requirementId={requirementId} proposalId={proposalId} />
    </main>
  );
}
