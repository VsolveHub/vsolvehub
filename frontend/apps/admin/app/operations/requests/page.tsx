import type { Metadata } from "next";

import { QueueBoard } from "@/features/m2-requests/view/queue-board";
import { OperationsShell } from "@/features/session/operations-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Requests",
  robots: { index: false, follow: false },
};

export default function RequestsPage() {
  return (
    <OperationsShell>
      <h1 className="text-2xl font-bold text-text">Requests</h1>
      <p className="mt-1 max-w-prose text-sm text-text-secondary">
        Everything that has stopped moving, and the recovery that clears it. Each queue is defined
        by a deadline already on the record, so nothing here invents a threshold.
      </p>
      <div className="mt-6">
        <QueueBoard />
      </div>
    </OperationsShell>
  );
}
