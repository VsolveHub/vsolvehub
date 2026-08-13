"use client";

import type { RejectionReason } from "@vsolve/query";
import { Button, Dialog, Field, Textarea } from "@vsolve/ui";
import { useState } from "react";

/**
 * Turning down one quote — `M2-FE-406`.
 *
 * Two reasons, and the dialog exists because they are not variations of one
 * another:
 *
 * - **`NOT_CHOSEN`** is bookkeeping. The Customer preferred somebody else. It
 *   costs nothing and says nothing about the vendor.
 * - **`NON_RESPONSIVE`** says the quote ignored the stated scope or is a
 *   placeholder. It releases that vendor's slot and buys a **replacement at no
 *   extra charge** — a new quote slot on A3, a free replacement visit on A5 —
 *   and it counts against a real person's standing.
 *
 * Presenting them as one control with a dropdown would let somebody spend an
 * allowance and mark a vendor without noticing either.
 *
 * ## The allowance is shown, and null means the option is not offered at all
 *
 * `non_responsive_rejections_remaining` is nullable because the cap is an owner
 * decision that has not been made. When it is null there is **no replacement
 * button**: offering one would promise a free replacement on a rule that does
 * not exist, and `POST .../reject/` answers `m2_policy_unavailable` to anybody
 * who presses it. Zero is different from null and reads differently — the rule
 * exists and it has been used up.
 */

export interface RejectQuoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Whose quote. Null renders as "this quote". */
  vendorName: string | null;
  /**
   * Free non-responsive replacements left, or null when the cap is unset.
   *
   * Null hides the non-responsive path entirely. See the note above.
   */
  replacementsRemaining: number | null;
  /** A5 gets a replacement visit; A3 gets another quote slot. */
  replacementKind: "quote" | "visit";
  onReject: (reason: RejectionReason, note: string) => void;
  isPending: boolean;
}

export function RejectQuoteDialog({
  open,
  onOpenChange,
  vendorName,
  replacementsRemaining,
  replacementKind,
  onReject,
  isPending,
}: RejectQuoteDialogProps) {
  const [note, setNote] = useState("");
  const who = vendorName ?? "this quote";
  const canReplace = replacementsRemaining !== null && replacementsRemaining > 0;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Turn down ${who}?`}
      description="Pick the one that is true. They mean different things and only one of them gets you a replacement."
      footer={
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Keep it for now
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <Choice
          title="I would rather go with somebody else"
          body="Nothing happens to them and nothing changes on your request. You can still choose one of the others."
          actionLabel="Turn it down"
          isPending={isPending}
          onAction={() => onReject("NOT_CHOSEN", note)}
        />

        {canReplace ? (
          <Choice
            title="This ignores what I asked for"
            body={
              replacementKind === "visit"
                ? `We will send another professional to visit and estimate, free. You have ${replacementsRemaining} of these left.`
                : `We will open the slot for another professional to quote, at no extra charge. You have ${replacementsRemaining} of these left.`
            }
            actionLabel="Turn it down and replace it"
            isPending={isPending}
            onAction={() => onReject("NON_RESPONSIVE", note)}
          />
        ) : replacementsRemaining === 0 ? (
          <p className="rounded-card border border-line bg-surface-sunken p-3 text-sm leading-6 text-text-secondary">
            You have used every free replacement on this request, so turning this
            one down will not bring another professional in. Talk to us if the
            quotes here are not usable.
          </p>
        ) : (
          <p className="rounded-card border border-line bg-surface-sunken p-3 text-sm leading-6 text-text-secondary">
            We cannot offer a free replacement on this request yet — we have not
            finished setting that rule. Turning this one down is still fine, and
            talk to us if none of the quotes work.
          </p>
        )}

        <Field
          label="Anything you want to add"
          description="Optional. It goes to us, not straight to the professional."
        >
          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            maxLength={2000}
          />
        </Field>
      </div>
    </Dialog>
  );
}

function Choice({
  title,
  body,
  actionLabel,
  onAction,
  isPending,
}: {
  title: string;
  body: string;
  actionLabel: string;
  onAction: () => void;
  isPending: boolean;
}) {
  return (
    <div className="rounded-card border border-line p-3">
      <p className="font-medium text-text">{title}</p>
      <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">{body}</p>
      <div className="mt-3">
        <Button size="sm" variant="outline" onClick={onAction} loading={isPending} loadingLabel="Sending">
          {actionLabel}
        </Button>
      </div>
    </div>
  );
}
