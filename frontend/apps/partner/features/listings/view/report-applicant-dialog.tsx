import { Flag, X } from "lucide-react";
import { snapshotFields, type PartnerApplication } from "../queries";

export interface ReportApplicantDialogProps {
  app: PartnerApplication | null;
  onClose: () => void;
  reason: string;
  onReasonChange: (reason: string) => void;
  detail: string;
  onDetailChange: (detail: string) => void;
  onSubmit: () => void;
  isPending: boolean;
  error?: string;
}

export function ReportApplicantDialog({
  app,
  onClose,
  reason,
  onReasonChange,
  detail,
  onDetailChange,
  onSubmit,
  isPending,
  error,
}: ReportApplicantDialogProps) {
  if (!app) return null;

  const applicantName =
    app.applicant_name || snapshotFields(app.applicant_snapshot).name || "Candidate";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Flag className="h-5 w-5 text-amber-600" />
            <h3 className="font-bold text-slate-950">Report Candidate</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          <p className="text-xs text-slate-600">
            Reporting candidate <strong>{applicantName}</strong>. This logs an abuse case for the
            trust & safety team to review.
          </p>

          <div>
            <label className="block text-xs font-semibold text-slate-700">Reason</label>
            <select
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
              className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-indigo-500"
            >
              <option value="SPAM">Spam / Bot submission</option>
              <option value="FRAUD">Fraudulent information or fake resume</option>
              <option value="HARASSMENT">Harassment or inappropriate message</option>
              <option value="OTHER">Other violation</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">Additional Details</label>
            <textarea
              rows={3}
              value={detail}
              onChange={(e) => onDetailChange(e.target.value)}
              placeholder="Explain why this candidate submission violates policy..."
              className="mt-1 w-full rounded-lg border border-slate-200 p-2.5 text-xs outline-none focus:border-indigo-500"
            />
          </div>

          {error && <p className="text-xs text-rose-600">{error}</p>}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {isPending ? "Submitting..." : "Submit Report"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
