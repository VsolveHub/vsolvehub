import { CheckCircle2, ShieldCheck, X, XCircle } from "lucide-react";
import type { AdminListing } from "../queries";

export interface ModerationDialogProps {
  listing: AdminListing | null;
  onClose: () => void;
  isApproving: boolean;
  setIsApproving: (approving: boolean) => void;
  actionReason: string;
  setActionReason: (reason: string) => void;
  submitting: boolean;
  onSubmit: () => void;
}

export function ModerationDialog({
  listing,
  onClose,
  isApproving,
  setIsApproving,
  actionReason,
  setActionReason,
  submitting,
  onSubmit,
}: ModerationDialogProps) {
  if (!listing) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="flex w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-orange-600" />
            <h3 className="font-bold text-slate-900">Moderation Decision</h3>
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
          <div>
            <span className="text-xs text-slate-500">Listing</span>
            <div className="font-bold text-slate-900 mt-0.5">{listing.title}</div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setIsApproving(true)}
              className={`flex-1 rounded-xl border p-3 text-center text-sm font-semibold transition-all ${
                isApproving
                  ? "border-emerald-500 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-500"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              <CheckCircle2 className="mx-auto mb-1 size-5 text-emerald-600" />
              Approve Listing
            </button>
            <button
              type="button"
              onClick={() => setIsApproving(false)}
              className={`flex-1 rounded-xl border p-3 text-center text-sm font-semibold transition-all ${
                !isApproving
                  ? "border-rose-500 bg-rose-50 text-rose-800 ring-2 ring-rose-500"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              <XCircle className="mx-auto mb-1 size-5 text-rose-600" />
              Reject / Return to Draft
            </button>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {isApproving ? "Approval Note (Optional)" : "Rejection Reason (Required)"}
            </label>
            <textarea
              rows={3}
              placeholder={
                isApproving
                  ? "e.g. Verified standard job posting"
                  : "Explain why this posting was rejected so employer can amend and resubmit"
              }
              value={actionReason}
              onChange={(e) => setActionReason(e.target.value)}
              className="w-full rounded-lg border border-slate-200 p-2.5 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
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
            disabled={submitting || (!isApproving && !actionReason.trim())}
            onClick={onSubmit}
            className={`rounded-lg px-4 py-2 text-xs font-bold text-white shadow-sm disabled:opacity-50 ${
              isApproving ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"
            }`}
          >
            {submitting ? "Processing..." : isApproving ? "Confirm Approval" : "Confirm Rejection"}
          </button>
        </div>
      </div>
    </div>
  );
}
