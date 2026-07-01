"use client";

import { useEffect, useRef } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Check, X } from "lucide-react";
import { decideDocument, type ActionState } from "@/app/(dashboard)/partners/[id]/actions";

function IconSubmit({ tone, icon, label }: { tone: "success" | "danger"; icon: React.ReactNode; label: string }) {
  const { pending } = useFormStatus();
  const toneClass =
    tone === "success"
      ? "border-green-200 bg-green-50 text-green-700 hover:bg-green-100"
      : "border-red-200 bg-red-50 text-danger hover:bg-red-100";
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={label}
      title={label}
      className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors disabled:pointer-events-none disabled:opacity-50 ${toneClass}`}
    >
      {icon}
    </button>
  );
}

export function DocumentActions({ docId }: { docId: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [approveState, approveAction] = useActionState<ActionState, FormData>(decideDocument, {});
  const [rejectState, rejectAction] = useActionState<ActionState, FormData>(decideDocument, {});

  useEffect(() => {
    if (rejectState.ok) dialogRef.current?.close();
  }, [rejectState.ok]);

  return (
    <div className="flex items-center gap-2">
      <form action={approveAction}>
        <input type="hidden" name="docId" value={docId} />
        <input type="hidden" name="approve" value="true" />
        <IconSubmit tone="success" icon={<Check className="h-4 w-4" />} label="Approve document" />
      </form>

      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        aria-label="Reject document"
        title="Reject document"
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-danger transition-colors hover:bg-red-100"
      >
        <X className="h-4 w-4" />
      </button>

      {approveState.error ? <p className="text-xs text-danger">{approveState.error}</p> : null}

      <dialog
        ref={dialogRef}
        className="fixed left-1/2 top-1/2 w-96 max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-card)] border border-border p-0 shadow-lg backdrop:bg-black/40"
      >
        <form action={rejectAction} className="p-6">
          <h2 className="text-lg font-bold text-ink-900">Reject document</h2>
          <p className="mt-1 text-sm text-gray-500">
            The partner sees this reason on their documents screen.
          </p>
          <input type="hidden" name="docId" value={docId} />
          <input type="hidden" name="approve" value="false" />
          <textarea
            name="reason"
            required
            rows={3}
            placeholder="e.g. Image is blurry — please re-upload a clear copy."
            className="mt-4 w-full rounded-lg border border-border p-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
          {rejectState.error ? <p className="mt-3 text-sm text-danger">{rejectState.error}</p> : null}
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="rounded-lg border border-border bg-white px-4 py-2 text-sm font-semibold text-ink-900 hover:bg-surface-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
            >
              Reject
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
