import type { Metadata } from "next";

import { QuestionThreadScreen } from "@/features/quotes/view/question-thread-screen";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Questions",
  robots: { index: false, follow: false },
};

export default async function EstimateQuestionsPage({
  params,
}: {
  params: Promise<{ requirementId: string; proposalId: string }>;
}) {
  const { requirementId, proposalId } = await params;
  return (
    <main>
      <QuestionThreadScreen requirementId={requirementId} proposalId={proposalId} />
    </main>
  );
}
