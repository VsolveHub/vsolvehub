import type { Metadata } from "next";

import { SwitchBoard } from "@/features/kill-switches/view/switch-board";
import { OperationsShell } from "@/features/session/operations-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Kill switches",
  robots: { index: false, follow: false },
};

export default function KillSwitchesPage() {
  return (
    <OperationsShell>
      <h1 className="text-2xl font-bold text-text">Kill switches</h1>
      <p className="mt-1 text-sm text-text-secondary">
        Stop a capability now. Every switch records who set it and why.
      </p>
      <div className="mt-6">
        <SwitchBoard />
      </div>
    </OperationsShell>
  );
}
