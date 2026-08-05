"use client";

import { useState } from "react";

import { FinanceShell } from "@/features/finance/view/finance-shell";
import { RefundConsole } from "@/features/finance/view/refund-console";
import { StepUpGate } from "@/features/finance/view/step-up-gate";
import type { StepUpSession } from "@/features/finance/queries";

/**
 * The Finance console: confirm who you are, then move money.
 *
 * The step-up sits above the commands because that is the order of the work, not
 * because it gates them in the browser. It does not: `FINANCE_STEP_UP_TTL_SECONDS`
 * is unpublished, so a client-side gate would be a guess about an authorization
 * decision. Django is the gate; a refused command sends the operator back up the
 * page with the reason.
 */
export default function FinancePage() {
  const [session, setSession] = useState<StepUpSession | null>(null);
  const [reason, setReason] = useState<string | null>(null);

  return (
    <FinanceShell>
      <h1 className="text-2xl font-bold text-text">Refunds</h1>
      <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">
        Refund visits on an Order, and ask the provider what became of a refund
        already sent. Both are recorded against your account.
      </p>

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
    </FinanceShell>
  );
}
