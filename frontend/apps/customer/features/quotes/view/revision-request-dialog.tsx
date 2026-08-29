"use client";

import type { RevisionRequestReasonCode } from "@vsolve/query";
import { Button, Dialog, Field, Textarea, cn } from "@vsolve/ui";
import { useState } from "react";

import type { QuoteCardView } from "../adapters";

/**
 * Asking a professional for a different estimate — with the reason attached.
 *
 * Not a negotiation. The rule stands that only a vendor states a price, so
 * there is no number on this dialog and nothing here changes one. What the
 * Customer sends is *what they want different*: the lines to leave out, a
 * cheaper finish, the work in phases, or a sentence. The vendor answers by
 * sending a fresh estimate the Customer reads in full, or by declining with a
 * note. Their current estimate stays valid meanwhile.
 */

const REASONS: readonly { code: RevisionRequestReasonCode; label: string; hint: string }[] = [
  { code: "LEAVE_OUT", label: "Leave something out", hint: "Tick the lines you do not need." },
  { code: "CHANGE_MATERIALS", label: "Change materials or finish", hint: "Say what you would prefer." },
  { code: "PHASE_WORK", label: "Split the work into phases", hint: "Say what should come first." },
  { code: "OTHER", label: "Something else", hint: "A sentence is enough." },
];

export interface RevisionRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  card: QuoteCardView | null;
  isPending: boolean;
  onSend: (reasonCode: RevisionRequestReasonCode, excludedItems: readonly string[], note: string) => void;
}

export function RevisionRequestDialog({ open, onOpenChange, card, isPending, onSend }: RevisionRequestDialogProps) {
  const [reason, setReason] = useState<RevisionRequestReasonCode>("LEAVE_OUT");
  const [excluded, setExcluded] = useState<readonly string[]>([]);
  const [note, setNote] = useState("");

  const lines = card === null ? [] : [...card.itemLines.map((line) => line.title), ...card.labourLines.map((line) => line.role)];
  const who = card?.vendorName ?? "this professional";
  const canSend =
    reason === "LEAVE_OUT" ? excluded.length > 0 || note.trim() !== "" : reason === "OTHER" ? note.trim() !== "" : true;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Ask ${who} for a revision`}
      description="They reply with a fresh estimate. Only they set the price — this sends what you want changed, not a number."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!canSend}
            loading={isPending}
            loadingLabel="Sending"
            onClick={() => onSend(reason, reason === "LEAVE_OUT" ? excluded : [], note.trim())}
          >
            Send request
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div role="radiogroup" aria-label="What would you like changed?" className="flex flex-col gap-2">
          {REASONS.map((option) => {
            const checked = reason === option.code;
            return (
              <label
                key={option.code}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-card border p-3 transition-colors duration-fast",
                  "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus-ring",
                  checked ? "border-selected bg-selected-surface" : "border-line bg-surface hover:border-line-strong",
                )}
              >
                <input
                  type="radio"
                  name="revision-reason"
                  value={option.code}
                  checked={checked}
                  onChange={() => setReason(option.code)}
                  className="mt-0.5 size-4"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-text">{option.label}</span>
                  <span className="block text-xs text-text-secondary">{option.hint}</span>
                </span>
              </label>
            );
          })}
        </div>

        {reason === "LEAVE_OUT" && lines.length > 0 ? (
          <fieldset className="rounded-card border border-line p-3">
            <legend className="px-1 text-xs font-bold uppercase tracking-[0.06em] text-text-muted">
              Leave out
            </legend>
            <div className="mt-1 flex flex-col gap-1.5">
              {lines.map((line) => {
                const checked = excluded.includes(line);
                return (
                  <label key={line} className="flex items-center gap-2.5 text-sm text-text">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setExcluded((current) =>
                          checked ? current.filter((entry) => entry !== line) : [...current, line],
                        )
                      }
                      className="size-4"
                    />
                    {line}
                  </label>
                );
              })}
            </div>
          </fieldset>
        ) : null}

        <Field label="Add a line" description="Optional for most reasons. It goes to the professional.">
          <Textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} maxLength={2000} />
        </Field>

        <p className="text-xs leading-5 text-text-muted">
          Your current estimate stays valid until they send the new one. Nothing is charged.
        </p>
      </div>
    </Dialog>
  );
}
