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
      <div className="w-full max-w-md rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-overlay">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-text flex items-center gap-2">
            <Flag className="size-4 text-text-muted" />
            Report Listing
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-text"
          >
            <X className="size-4" />
          </button>
        </div>

        <p className="mt-2 text-xs text-text-muted">
          Help us maintain community safety. Reports open an immediate review ticket for our
          operations team.
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-text-secondary">Reason</label>
            <select
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
              className="mt-1 h-10 w-full rounded-control border border-line bg-surface px-3 text-sm text-text outline-none focus:border-line-strong"
            >
              <option value="spam_or_abuse">Spam, Phishing, or Scam</option>
              <option value="fraudulent">Fraudulent or Asking for Upfront Payment</option>
              <option value="inaccurate_details">Inaccurate or Misleading Role Details</option>
              <option value="offensive_content">Offensive or Inappropriate Content</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-secondary">Additional Details</label>
            <textarea
              value={detail}
              onChange={(e) => onDetailChange(e.target.value)}
              rows={3}
              placeholder="Describe the issue you noticed..."
              className="mt-1 w-full rounded-control border border-line bg-surface p-2.5 text-sm text-text outline-none focus:border-line-strong"
            >
            </textarea>
          </div>

          {error && <p className="text-xs text-danger-text">{error}</p>}

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-control border border-line px-3.5 py-2 text-xs font-semibold text-text-secondary hover:bg-surface-hover"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSubmit}
              disabled={isPending}
              className="rounded-control bg-navy-900 px-4 py-2 text-xs font-semibold text-warm-0 hover:bg-navy-800 disabled:opacity-50"
            >
              {isPending ? "Submitting..." : "Submit Report"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
