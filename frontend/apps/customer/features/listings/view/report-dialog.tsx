import { Flag, X } from "lucide-react";

export interface ReportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  reason: string;
  onReasonChange: (reason: string) => void;
  detail: string;
  onDetailChange: (detail: string) => void;
  onSubmit: () => void;
  isPending: boolean;
  error?: string;
}

export function ReportDialog({
  isOpen,
  onClose,
  reason,
  onReasonChange,
  detail,
  onDetailChange,
  onSubmit,
  isPending,
  error,
}: ReportDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-950 flex items-center gap-2">
            <Flag className="h-4 w-4 text-rose-600" />
            Report Listing
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-2 text-xs text-slate-500">
          Help us maintain community safety. Reports open an immediate review ticket for our
          operations team.
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700">Reason</label>
            <select
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none"
            >
              <option value="spam_or_abuse">Spam, Phishing, or Scam</option>
              <option value="fraudulent">Fraudulent or Asking for Upfront Payment</option>
              <option value="inaccurate_details">Inaccurate or Misleading Role Details</option>
              <option value="offensive_content">Offensive or Inappropriate Content</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">Additional Details</label>
            <textarea
              value={detail}
              onChange={(e) => onDetailChange(e.target.value)}
              rows={3}
              placeholder="Describe the issue you noticed..."
              className="mt-1 w-full rounded-lg border border-slate-200 p-2.5 text-sm outline-none"
            />
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSubmit}
              disabled={isPending}
              className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
            >
              {isPending ? "Submitting..." : "Submit Report"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
