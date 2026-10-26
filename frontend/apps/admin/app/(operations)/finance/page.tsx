import type { Metadata } from "next";
import { FinanceWorkspace } from "@/features/finance/view/finance-workspace";

export const metadata: Metadata = { title: "Refunds" };

/**
 * Refunds: confirm who you are, then move money.
 *
 * An Operations workspace like every other, gated by `HasRecentOperationsStepUp`
 * rather than a separate role. The extra confirmation is the whole control that
 * remains, and it is the one that was doing the work: a `finance` grant nobody
 * held made these endpoints unreachable, while a fresh OTP before money leaves
 * the business is a real check on a real risk.
 *
 * The step-up sits above the commands because that is the order of the work, not
 * because it gates them in the browser. It does not: `OPERATIONS_STEP_UP_TTL_SECONDS`
 * is unpublished, so a client-side gate would be a guess about an authorization
 * decision. Django is the gate; a refused command sends the operator back up the
 * page with the reason.
 */
export default function FinancePage() {
  return (
    <>

      <FinanceWorkspace />
    </>
  );
}
