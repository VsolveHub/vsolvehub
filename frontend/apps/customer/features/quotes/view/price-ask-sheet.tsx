"use client";

import type { RevisionRequestReasonCode } from "@vsolve/query";
import { Button, Dialog, Field, Input, Textarea, cn } from "@vsolve/ui";
import { useState } from "react";

import { discountPreview, type QuoteCardView } from "../adapters";

/**
 * Everything a Customer might want to say about an estimate, in one sheet.
 *
 * ## Why one sheet and not two
 *
 * "This is more than I can spend" and "leave the false ceiling out" are the
 * same conversation. Splitting them into a price dialog and a revision dialog
 * would give a vendor two inboxes, the server two open-request state machines
 * per estimate, and a race whenever both were open. So the price ask is a
 * fifth reason code on the request that already exists, and this sheet
 * replaces `RevisionRequestDialog` rather than sitting beside it.
 *
 * ## The rule, and how a number survives it
 *
 * Only a vendor states a price. What a Customer sends here is what they
 * *hope to pay* — a non-binding ask the vendor answers with their own
 * superseding estimate, or declines. Nothing on this sheet changes a total,
 * and the estimate stays live and choosable the entire time it is open. The
 * rupee figures beside each chip are arithmetic for the reader; they are never
 * transmitted and never stored.
 *
 * ## "It works for me" is the first option and it is not a no-op
 *
 * It closes the sheet and sends the Customer to the confirm screen. A person
 * opens this sheet uncertain, and the honest set of exits is *negotiate* or
 * *commit* — not "negotiate or give up and close a modal". It writes nothing
 * to the server.
 */

/** The two offers worth one tap. Anything else is a number somebody has in mind. */
const QUICK_BPS = [300, 500] as const;

/** Matches `RevisionRequest.MAX_DISCOUNT_BPS`. The server refuses beyond it. */
const MAX_PERCENT = 15;
/** Above this the honest request is a smaller scope, and the sheet says so. */
const STEER_TO_SCOPE_PERCENT = 10;

const SCOPE_REASONS: readonly { code: RevisionRequestReasonCode; label: string; hint: string }[] = [
  { code: "LEAVE_OUT", label: "Leave something out", hint: "Tick the lines you do not need." },
  { code: "CHANGE_MATERIALS", label: "Change materials or finish", hint: "Say what you would prefer." },
  { code: "PHASE_WORK", label: "Split the work into phases", hint: "Say what should come first." },
  { code: "OTHER", label: "Something else", hint: "A sentence is enough." },
];

type Choice =
  | { kind: "ACCEPT" }
  | { kind: "PRICE"; bps: number }
  | { kind: "CUSTOM" }
  | { kind: "SCOPE" };

export interface PriceAskSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  card: QuoteCardView | null;
  isPending: boolean;
  /** "It works for me" — leaves for the confirm screen. Writes nothing. */
  onAccept: (proposalId: string) => void;
  onSend: (input: {
    reasonCode: RevisionRequestReasonCode;
    excludedItems: readonly string[];
    note: string;
    requestedDiscountBps: number | null;
  }) => void;
}

export function PriceAskSheet({
  open,
  onOpenChange,
  card,
  isPending,
  onAccept,
  onSend,
}: PriceAskSheetProps) {
  const [choice, setChoice] = useState<Choice>({ kind: "ACCEPT" });
  const [customPercent, setCustomPercent] = useState("7");
  const [scopeReason, setScopeReason] = useState<RevisionRequestReasonCode>("LEAVE_OUT");
  const [excluded, setExcluded] = useState<readonly string[]>([]);
  const [note, setNote] = useState("");

  if (card === null) return null;

  const who = card.vendorName ?? "this professional";
  const lines = [...card.itemLines.map((line) => line.title), ...card.labourLines.map((line) => line.role)];

  const parsedCustom = Number.parseInt(customPercent, 10);
  const customValid = Number.isFinite(parsedCustom) && parsedCustom >= 1 && parsedCustom <= MAX_PERCENT;
  const customBps = customValid ? parsedCustom * 100 : null;

  const askedBps =
    choice.kind === "PRICE" ? choice.bps : choice.kind === "CUSTOM" ? customBps : null;

  const canSend =
    choice.kind === "ACCEPT"
      ? true
      : choice.kind === "PRICE"
        ? true
        : choice.kind === "CUSTOM"
          ? customValid
          : scopeReason === "LEAVE_OUT"
            ? excluded.length > 0 || note.trim() !== ""
            : scopeReason === "OTHER"
              ? note.trim() !== ""
              : true;

  function send() {
    if (card === null) return;
    if (choice.kind === "ACCEPT") {
      onAccept(card.proposalId);
      return;
    }
    if (choice.kind === "SCOPE") {
      onSend({
        reasonCode: scopeReason,
        excludedItems: scopeReason === "LEAVE_OUT" ? excluded : [],
        note: note.trim(),
        requestedDiscountBps: null,
      });
      return;
    }
    if (askedBps === null) return;
    onSend({
      reasonCode: "PRICE",
      excludedItems: [],
      note: note.trim(),
      requestedDiscountBps: askedBps,
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="About this price"
      description={`${who} · ${card.payableLabel}. Only they can change a price — this sends what you are hoping for, and they answer with a fresh estimate or say no.`}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!canSend} loading={isPending} loadingLabel="Sending" onClick={send}>
            {choice.kind === "ACCEPT" ? "Take me to Choose" : "Send the ask"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2.5">
        <ChoiceRow
          checked={choice.kind === "ACCEPT"}
          onSelect={() => setChoice({ kind: "ACCEPT" })}
          label="It works for me"
          detail="Take me to Choose."
          tone="positive"
        />

        {QUICK_BPS.map((bps) => {
          const preview = discountPreview(card.payablePaise, bps);
          return (
            <ChoiceRow
              key={bps}
              checked={choice.kind === "PRICE" && choice.bps === bps}
              onSelect={() => setChoice({ kind: "PRICE", bps })}
              label={`Ask for ${bps / 100}% off`}
              detail={
                <span className="tabular-nums">
                  {card.payableLabel} → <strong className="font-bold text-text">{preview.newTotalLabel}</strong>
                  <span className="text-success-text"> −{preview.savingLabel}</span>
                </span>
              }
            />
          );
        })}

        <ChoiceRow
          checked={choice.kind === "CUSTOM"}
          onSelect={() => setChoice({ kind: "CUSTOM" })}
          label="Name your own figure"
          detail={
            choice.kind !== "CUSTOM" ? (
              "Up to 15%."
            ) : (
              <span className="mt-1 flex flex-wrap items-center gap-2">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_PERCENT}
                  value={customPercent}
                  aria-label="Discount percent"
                  onChange={(event) => setCustomPercent(event.target.value)}
                  className="w-20"
                />
                <span className="text-sm font-semibold text-text-secondary">%</span>
                {customBps !== null ? (
                  <span className="tabular-nums text-sm text-text-secondary">
                    → <strong className="font-bold text-text">
                      {discountPreview(card.payablePaise, customBps).newTotalLabel}
                    </strong>
                    <span className="text-success-text">
                      {" "}
                      −{discountPreview(card.payablePaise, customBps).savingLabel}
                    </span>
                  </span>
                ) : (
                  <span className="text-sm text-warning-text">Between 1 and {MAX_PERCENT}.</span>
                )}
              </span>
            )
          }
        />

        {choice.kind === "CUSTOM" && customValid && parsedCustom > STEER_TO_SCOPE_PERCENT ? (
          <p className="rounded-[10px] border border-warning-line bg-warning-surface px-3 py-2 text-[13px] leading-5 text-text">
            Above {STEER_TO_SCOPE_PERCENT}% is usually a different job, not a discount. You are more
            likely to get a yes by asking them to leave something out — that is the option below.
          </p>
        ) : null}

        <ChoiceRow
          checked={choice.kind === "SCOPE"}
          onSelect={() => setChoice({ kind: "SCOPE" })}
          label="It is not about the price"
          detail="Leave something out · cheaper finish · split into phases · something else"
        />

        {choice.kind === "SCOPE" ? (
          <div className="ml-1 flex flex-col gap-2 border-l-2 border-line pl-3">
            <div role="radiogroup" aria-label="What would you like changed?" className="flex flex-col gap-1.5">
              {SCOPE_REASONS.map((option) => (
                <label key={option.code} className="flex cursor-pointer items-start gap-2.5 text-sm">
                  <input
                    type="radio"
                    name="scope-reason"
                    value={option.code}
                    checked={scopeReason === option.code}
                    onChange={() => setScopeReason(option.code)}
                    className="mt-1 size-4"
                  />
                  <span className="min-w-0">
                    <span className="block font-semibold text-text">{option.label}</span>
                    <span className="block text-xs text-text-secondary">{option.hint}</span>
                  </span>
                </label>
              ))}
            </div>

            {scopeReason === "LEAVE_OUT" && lines.length > 0 ? (
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
          </div>
        ) : null}

        {choice.kind !== "ACCEPT" ? (
          <Field
            label="Add a line"
            description="Optional. It goes to the professional — a reason lands better than a number alone."
          >
            <Textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} maxLength={2000} />
          </Field>
        ) : null}

        <p className="rounded-[10px] bg-surface-sunken px-3 py-2 text-xs leading-5 text-text-secondary">
          This estimate stays live and you can still choose it at {card.payableLabel} while they
          think. Nothing is charged. You can ask about the price once.
        </p>
      </div>
    </Dialog>
  );
}

function ChoiceRow({
  checked,
  onSelect,
  label,
  detail,
  tone = "neutral",
}: {
  checked: boolean;
  onSelect: () => void;
  label: string;
  detail: React.ReactNode;
  tone?: "neutral" | "positive";
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-card border p-3 transition-colors duration-fast",
        "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus-ring",
        checked
          ? tone === "positive"
            ? "border-success-line bg-success-surface"
            : "border-selected bg-selected-surface"
          : "border-line bg-surface hover:border-line-strong",
      )}
    >
      <input
        type="radio"
        name="price-ask-choice"
        checked={checked}
        onChange={onSelect}
        className="mt-0.5 size-4 shrink-0"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-text">{label}</span>
        <span className="block text-[13px] leading-5 text-text-secondary">{detail}</span>
      </span>
    </label>
  );
}
