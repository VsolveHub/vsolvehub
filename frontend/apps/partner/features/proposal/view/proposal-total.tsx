"use client";

import { Readout, formatMoney } from "@vsolve/ui";

/**
 * The number the customer compares, and the one place it is never typed.
 *
 * Closes the presentation half of `M2-FE-312`. Two distinct sources, and the
 * distinction is the whole component:
 *
 * - **`derived`** — computed from the fields above it while the vendor is still
 *   writing. Read-only, and labelled as a working figure so nobody reads it as
 *   an agreement.
 * - **`server`** — `Proposal.total_paise` echoed back by Django after the 201.
 *   Once it exists it replaces the derived figure entirely, because it is the
 *   number the customer will actually see.
 *
 * A screen that kept showing its own arithmetic after submission would be
 * showing the vendor a total the server may not have stored — and for a
 * workforce quote the server genuinely does not recompute it, so the echo is the
 * only confirmation that exists. See `model/proposal-draft.ts` for why that
 * missing reconciliation is logged rather than compensated for here.
 */

export interface ProposalTotalProps {
  /** The client's working figure. `null` while the inputs are incomplete. */
  readonly derivedPaise: number | null;
  /** The server's own figure, once a quote has been submitted. */
  readonly serverPaise?: number | null;
  /** How the total was reached, in the composer's own terms. */
  readonly basis: string;
}

export function ProposalTotal({ derivedPaise, serverPaise = null, basis }: ProposalTotalProps) {
  if (serverPaise !== null) {
    return (
      <Readout
        label="Quoted to the customer"
        value={formatMoney(serverPaise)}
        tone="active"
        caption="As recorded by Vsolve"
      />
    );
  }

  return (
    <Readout
      label="Your total"
      value={derivedPaise === null ? "—" : formatMoney(derivedPaise)}
      tone="neutral"
      caption={derivedPaise === null ? "Fill in the fields above" : basis}
      announce={
        derivedPaise === null
          ? "Your total will appear once the fields above are filled in"
          : `Your total is ${formatMoney(derivedPaise)}, ${basis}`
      }
    />
  );
}
