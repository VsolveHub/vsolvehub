"use client";

import { Badge } from "@vsolve/ui";

import { AccountNote, Moment } from "./chrome";
import type { ConsentReceipt } from "../queries";

/**
 * Consent receipts: what this screen can honestly show, and why it is not a list.
 *
 * ## The gap
 *
 * `POST /api/v1/auth/privacy/consents/` is the only published consent operation.
 * `ConsentReceiptView` in `backend/apps/identity/views.py` defines `post` and
 * nothing else — there is no `GET`, so a customer's consent history is not
 * readable by any client. `purpose` and `policy_version` are free-text fields
 * with no endpoint publishing the valid values either.
 *
 * ## What that rules out
 *
 * Two things, both of which would look like features:
 *
 *  - **A history table.** With no read, the only way to fill one is from what
 *    this browser happens to have posted. That is a consent log assembled by the
 *    client, shown to someone who would reasonably read it as the record — the
 *    single worst place in the product to display something we did not get from
 *    the server.
 *
 *  - **An "I accept the current policy" button.** Recording a receipt means
 *    choosing a `policy_version`. Nothing publishes one, so the version would be
 *    minted here — a legal artifact invented by a React component, stored
 *    against a real person's account.
 *
 * ## What is left, and why it is worth a screen
 *
 * Where consent actually gets recorded today (accepting terms at checkout; an
 * agent booking on your behalf, which `carts/services.py` refuses without a live
 * receipt), and the one route that does reach the record: an access request,
 * which is published, works, and is one section down this same page.
 *
 * Delete all of this and render the real list the moment the contract gains
 * `GET /api/v1/auth/privacy/consents/`. `ConsentReceiptCard` below is kept
 * because it is what that list's rows will be made of, and it is already correct.
 */

/** One receipt, for when a list of them can be read. */
export function ConsentReceiptCard({ receipt }: { receipt: ConsentReceipt }) {
  const isWithdrawn = Boolean(receipt.withdrawn_at);

  return (
    <li className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-line py-4 last:border-b-0">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-text">{receipt.purpose}</h3>
        <p className="mt-0.5 text-xs text-text-muted">
          Policy {receipt.policy_version} · Agreed <Moment value={receipt.accepted_at} />
          {receipt.withdrawn_at ? (
            <>
              {" · Withdrawn "}
              <Moment value={receipt.withdrawn_at} />
            </>
          ) : null}
        </p>
      </div>
      <Badge tone={isWithdrawn ? "neutral" : "success"}>
        {isWithdrawn ? "Withdrawn" : "Active"}
      </Badge>
    </li>
  );
}

const RECORDED_WHEN = [
  {
    title: "When you agree to the terms at checkout",
    body: "Paying for a booking records that you accepted the terms in force that day.",
  },
  {
    title: "When an agent books for you",
    body: "If someone from Vsolve Hub books on a call with you, we cannot complete it without your consent on record first.",
  },
];

export function ConsentReceipts() {
  return (
    <div>
      <ul className="flex flex-col gap-3">
        {RECORDED_WHEN.map((item) => (
          <li key={item.title} className="rounded-card border border-line bg-surface-sunken p-4">
            <h3 className="text-sm font-semibold text-text">{item.title}</h3>
            <p className="mt-1 text-sm text-text-secondary">{item.body}</p>
          </li>
        ))}
      </ul>

      <div className="mt-4">
        <AccountNote>
          Your consent record is held on our side and is not shown here yet. Ask
          for a copy of your data below and it comes with the rest of your
          account.
        </AccountNote>
      </div>
    </div>
  );
}
