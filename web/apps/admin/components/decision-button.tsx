"use client";

import { useEffect, useRef } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@vsolve/ui";
import { decidePartner, type ActionState } from "@/app/(dashboard)/partners/[id]/actions";
import type { PartnerDecision } from "@/lib/partner-status";

function ConfirmButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Working…" : label}
    </Button>
  );
}

export function DecisionButton({
  partnerId,
  decision,
  label,
  helpText,
  variant = "primary",
  requireReason = false,
}: {
  partnerId: string;
  decision: PartnerDecision;
  label: string;
  helpText: string;
  variant?: "primary" | "accent" | "outline" | "ghost";
  requireReason?: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, action] = useActionState<ActionState, FormData>(decidePartner, {});

  useEffect(() => {
    if (state.ok) dialogRef.current?.close();
  }, [state.ok]);

  return (
    <>
      <Button type="button" variant={variant} onClick={() => dialogRef.current?.showModal()}>
        {label}
      </Button>
      <dialog
        ref={dialogRef}
        className="fixed left-1/2 top-1/2 w-96 max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-card)] border border-border p-0 shadow-lg backdrop:bg-black/40"
      >
        <form action={action} className="p-6">
          <h2 className="text-lg font-bold text-ink-900">{label}?</h2>
          <p className="mt-1 text-sm text-gray-500">{helpText}</p>
          <input type="hidden" name="partnerId" value={partnerId} />
          <input type="hidden" name="decision" value={decision} />
          <textarea
            name="reason"
            required={requireReason}
            rows={3}
            placeholder={requireReason ? "Reason — shown in the audit log." : "Optional note — shown in the audit log."}
            className="mt-4 w-full rounded-lg border border-border p-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
          {state.error ? <p className="mt-3 text-sm text-danger">{state.error}</p> : null}
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => dialogRef.current?.close()}>
              Cancel
            </Button>
            <ConfirmButton label={label} />
          </div>
        </form>
      </dialog>
    </>
  );
}
