"use client";

import { Button, Dialog, Field, Select, useT } from "@vsolve/ui";
import { useId, useState } from "react";

import {
  asDeclineReasonCode,
  declineReasonsFor,
  findDeclineReason,
  type DeclineReasonCode,
} from "../model/decline-reasons";

/**
 * Turning an enquiry down, with the reason that makes the next invitation useful.
 *
 * The reason-capture half of `M2-FE-303`. Declining is a one-way door — the slot
 * is released and `matching.decline_invitation` will not take it back — so it
 * goes through a dialog that states the consequence, rather than a button that
 * fires on the first tap.
 *
 * ## Why the consequence line changes with the reason
 *
 * A reason box nobody explains is a reason box people click through, and a
 * decline reason nobody acts on is worse than none — it makes the matcher look
 * like it is learning when it is not. Each option says what Vsolve does with it,
 * so the vendor is choosing an outcome rather than filling a field.
 *
 * ## Duplicate submission
 *
 * The confirm button is blocked while the command is in flight, and the command
 * itself carries a stable `Idempotency-Key`, so a double tap that beats the
 * disabled state still resolves to one decline. Both, because the first is what
 * the vendor sees and the second is what makes it true.
 */

export interface DeclineDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onDecline: (reasonCode: DeclineReasonCode) => void;
  readonly pending: boolean;
  /** A refusal from the last attempt, already presented. Kept visible in the dialog. */
  readonly error?: string | null;
  /** Fires on pointerdown for footer actions — e.g. stop an alert loop immediately. */
  readonly onActionPointerDown?: () => void;
}

export function DeclineDialog({
  open,
  onOpenChange,
  onDecline,
  pending,
  error,
  onActionPointerDown,
}: DeclineDialogProps) {
  const t = useT();
  const [reasonCode, setReasonCode] = useState("");
  const [touched, setTouched] = useState(false);
  const errorId = useId();

  const chosen = findDeclineReason(reasonCode, t);
  const missing = touched && reasonCode === "";

  const submit = () => {
    setTouched(true);
    // Narrowed against the published vocabulary rather than cast. The `<select>`
    // can only hold a value this component rendered, so a miss here means the
    // enum moved under the build — and posting an unpublished code would earn a
    // 400 the vendor cannot act on.
    const code = asDeclineReasonCode(reasonCode);
    if (code === null) return;
    onDecline(code);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("enquiry.declineDialog.title")}
      description={t("enquiry.declineDialog.description")}
      // Dismissable: nothing has been sent yet, and trapping a vendor in a
      // dialog they opened by accident is its own failure.
      dismissable
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={pending}
            data-booking-alert-action=""
            onPointerDown={() => onActionPointerDown?.()}
          >
            {t("enquiry.declineDialog.keep")}
          </Button>
          <Button
            variant="danger"
            onClick={submit}
            loading={pending}
            loadingLabel={t("enquiry.declineDialog.declining")}
            disabled={pending}
            data-booking-alert-action=""
            onPointerDown={() => onActionPointerDown?.()}
          >
            {t("enquiry.declineDialog.decline")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field
          label={t("enquiry.declineDialog.reasonLabel")}
          required
          error={missing ? t("enquiry.declineDialog.reasonMissing") : undefined}
        >
          <Select
            placeholder={t("enquiry.declineDialog.reasonPlaceholder")}
            value={reasonCode}
            onChange={(event) => {
              setReasonCode(event.target.value);
              setTouched(true);
            }}
            disabled={pending}
          >
            {declineReasonsFor(t).map((reason) => (
              <option key={reason.code} value={reason.code}>
                {reason.label}
              </option>
            ))}
          </Select>
        </Field>

        {chosen ? (
          <p className="text-sm leading-6 text-text-secondary">{chosen.consequence}</p>
        ) : null}

        {error ? (
          <p id={errorId} role="alert" className="text-sm leading-6 text-danger-text">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
