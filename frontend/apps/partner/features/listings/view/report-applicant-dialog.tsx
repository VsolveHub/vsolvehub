import { Flag, X } from "lucide-react";
import { useT } from "@vsolve/ui";
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
  const t = useT();
  if (!app) return null;

  const applicantName =
    app.applicant_name || snapshotFields(app.applicant_snapshot).name || t("listings.report.candidateFallback");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="w-full max-w-md rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-overlay">
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div className="flex items-center gap-2">
            <Flag className="size-4 text-text-muted" />
            <h3 className="font-bold text-text">{t("listings.report.title")}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-control p-1 text-text-muted hover:bg-surface-hover"
          >
            <X className="size-4" />
          </button>
        </div>

        <form
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          <p className="text-xs text-text-secondary">
            {t("listings.report.descriptionPrefix")} <strong>{applicantName}</strong>
            {t("listings.report.descriptionSuffix")}
          </p>

          <div>
            <label className="block text-xs font-semibold text-text-secondary">{t("listings.report.reasonLabel")}</label>
            <select
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
              className="mt-1 h-9 w-full rounded-control border border-line bg-surface px-3 text-xs text-text outline-none focus:border-line-strong"
            >
              <option value="SPAM">{t("listings.report.reason.spam")}</option>
              <option value="FRAUD">{t("listings.report.reason.fraud")}</option>
              <option value="HARASSMENT">{t("listings.report.reason.harassment")}</option>
              <option value="OTHER">{t("listings.report.reason.other")}</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-secondary">{t("listings.report.detailsLabel")}</label>
            <textarea
              rows={3}
              value={detail}
              onChange={(e) => onDetailChange(e.target.value)}
              placeholder={t("listings.report.detailsPlaceholder")}
              className="mt-1 w-full rounded-control border border-line bg-surface p-2.5 text-xs text-text outline-none focus:border-line-strong"
            />
          </div>

          {error && <p className="text-xs text-danger-text">{error}</p>}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
            <button
              type="button"
              onClick={onClose}
              className="rounded-control border border-line px-3 py-1.5 text-xs font-semibold text-text-secondary hover:bg-surface-hover"
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="rounded-control bg-navy-900 px-4 py-1.5 text-xs font-semibold text-warm-0 hover:bg-navy-800 disabled:opacity-50"
            >
              {isPending ? t("listings.report.submitting") : t("listings.report.submit")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
