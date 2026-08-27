"use client";

import { useState } from "react";

import { RefundConsole } from "@/features/finance/view/refund-console";
import { StepUpGate } from "@/features/finance/view/step-up-gate";
import type { StepUpSession } from "@/features/finance/queries";

export function FinanceWorkspace() {
  const [session, setSession] = useState<StepUpSession | null>(null);
  const [reason, setReason] = useState<string | null>(null);

  return (
    <div className="mt-6 flex flex-col gap-6">
      <StepUpGate
        session={session}
        reason={reason ?? undefined}
        onSteppedUp={(stepped) => {
          setSession(stepped);
          setReason(null);
        }}
      />

      <RefundConsole onStepUpRequired={setReason} />
    </div>
  );
}
