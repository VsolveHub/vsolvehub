import { CheckCircle2, ShieldAlert, X } from "lucide-react";
import type { AdminListing } from "../queries";

export interface ActionDialogProps {
  action: "REMOVE" | "REINSTATE" | null;
  listing: AdminListing | null;
  onClose: () => void;
  reason: string;
  onReasonChange: (reason: string) => void;
  submitting: boolean;
  onSubmit: () => void;
}

export function ActionDialog({
  action,
  listing,
  onClose,
  reason,
  onReasonChange,
  submitting,
  onSubmit,
}: ActionDialogProps) {
  if (!action || !listing) return null;

  const isRemove = action === "REMOVE";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="flex w-full max-w-md flex-col rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className={`flex items-center gap-2 ${isRemove ? "text-rose-600" : "text-slate-800"}`}>
            {isRemove ? (
              <ShieldAlert className="size-5" />
            ) : (
              <CheckCircle2 className="size-5 text-emerald-600" />
            )}
            <h3 className="font-bold text-slate-900">
              {isRemove ? "Take Down Listing" : "Reinstate Listing"}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 text-sm">
          <p className="text-slate-600">
            {isRemove ? (
              <>
                Taking down <strong className="text-slate-900">{listing.title}</strong> will
                immediately withdraw it from public search and notify the employer.
              </>
            ) : (
              <>
                Reinstate <strong className="text-slate-900">{listing.title}</strong> back to active
                circulation.
              </>
            )}
          </p>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {isRemove ? "Policy Violation Reason (Required)" : "Reinstatement Note"}
            </label>
            <textarea
              rows={3}
              placeholder={
                isRemove
                  ? "e.g. Fraudulent recruitment, reported abuse, or scam job offer"
                  : "Reason for reinstatement"
              }
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
              className={`w-full rounded-lg border border-slate-200 p-2.5 text-sm focus:outline-none focus:ring-1 ${
                isRemove
                  ? "focus:border-rose-500 focus:ring-rose-500"
                  : "focus:border-emerald-500 focus:ring-emerald-500"
              }`}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-6 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting || (isRemove && !reason.trim())}
            onClick={onSubmit}
            className={`rounded-lg px-4 py-2 text-xs font-bold text-white shadow-sm disabled:opacity-50 ${
              isRemove
                ? "bg-rose-600 hover:bg-rose-700"
                : "bg-emerald-600 hover:bg-emerald-700"
            }`}
          >
            {submitting
              ? isRemove
                ? "Removing..."
                : "Reinstating..."
              : isRemove
                ? "Execute Takedown"
                : "Confirm Reinstatement"}
          </button>
        </div>
      </div>
    </div>
  );
}
