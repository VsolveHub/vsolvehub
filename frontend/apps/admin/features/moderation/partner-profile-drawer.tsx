"use client";

import { useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Spinner, Textarea, formatDate } from "@vsolve/ui";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  MapPin,
  Phone,
  Shield,
  ShieldAlert,
  User,
  X,
} from "lucide-react";

import { usePartnerRecord } from "@/features/partners/queries";
import { useTransitionApplication } from "@/features/partner-review/queries";
import { queryKeys } from "@vsolve/query";

export interface PartnerProfileDrawerProps {
  partnerId: string | null;
  partnerName?: string;
  partnerPhone?: string;
  open: boolean;
  onClose: () => void;
}

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  APPROVED: "success",
  ACTIVE: "success",
  PENDING: "neutral",
  SUBMITTED: "neutral",
  UNDER_REVIEW: "warning",
  CHANGES_REQUIRED: "warning",
  SUSPENDED: "danger",
  DECLINED: "danger",
  REJECTED: "danger",
  OFFBOARDED: "neutral",
};

export function PartnerProfileDrawer({
  partnerId,
  partnerName,
  partnerPhone,
  open,
  onClose,
}: PartnerProfileDrawerProps) {
  const queryClient = useQueryClient();
  const record = usePartnerRecord(partnerId);
  const transitionMutation = useTransitionApplication();

  const [confirmAction, setConfirmAction] = useState<"SUSPEND" | "REINSTATE" | null>(null);
  const [actionReason, setActionReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  if (!open) return null;

  const partner = record.data;
  const isSuspended = partner?.application_status === "SUSPENDED";
  const isApproved = partner?.application_status === "APPROVED";

  const handleAction = async () => {
    if (!partner?.application_id || !confirmAction) return;
    if (confirmAction === "SUSPEND" && !actionReason.trim()) {
      setActionError("A reason is required to suspend a partner.");
      return;
    }

    setActionError(null);
    try {
      await transitionMutation.mutateAsync({
        applicationId: partner.application_id,
        expectedVersion: partner.application_version,
        targetStatus: confirmAction === "SUSPEND" ? "SUSPENDED" : "APPROVED",
        reason: actionReason.trim() || (confirmAction === "REINSTATE" ? "Reinstated by Operations admin." : ""),
      });
      setConfirmAction(null);
      setActionReason("");
      void queryClient.invalidateQueries({
        queryKey: queryKeys.operations.partnerRecord(partner.id),
      });
      void queryClient.invalidateQueries({ queryKey: ["ops-rentals"] });
      void queryClient.invalidateQueries({ queryKey: ["ops-stays"] });
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Failed to update partner status.");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-navy-900/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex h-full w-full max-w-xl flex-col bg-surface shadow-overlay animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-full bg-navy-100 text-navy-800">
              <User className="size-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-navy-900">
                {partner?.display_name || partnerName || "Partner Profile"}
              </h2>
              <p className="text-xs text-text-secondary">Operations Partner & Poster Record</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-text-muted hover:bg-surface-sunken hover:text-text"
            aria-label="Close drawer"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6 text-sm">
          {/* Quick Contact & Status Banner */}
          <div className="rounded-xl border border-line bg-surface-sunken/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-navy-900">
                  {partner?.display_name || partnerName || "Partner"}
                </span>
                {partner?.application_status && (
                  <Badge tone={STATUS_TONE[partner.application_status] ?? "neutral"}>
                    {partner.application_status.replace(/_/g, " ")}
                  </Badge>
                )}
              </div>
              {partnerPhone && (
                <a
                  href={`tel:${partnerPhone}`}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-700"
                >
                  <Phone className="size-3.5" />
                  {partnerPhone}
                </a>
              )}
            </div>

            {partner?.biography ? (
              <p className="mt-3 text-xs leading-relaxed text-text-secondary">
                {partner.biography}
              </p>
            ) : null}

            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line/60 pt-3 text-xs">
              <div>
                <span className="text-text-muted">Experience:</span>{" "}
                <span className="font-medium text-navy-900">
                  {partner?.experience_years ? `${partner.experience_years} years` : "Unspecified"}
                </span>
              </div>
              <div>
                <span className="text-text-muted">Partner ID:</span>{" "}
                <span className="font-mono text-[11px] text-text-secondary">
                  {partnerId ? `${partnerId.slice(0, 8)}…` : "—"}
                </span>
              </div>
            </div>
          </div>

          {/* Partner Action Block */}
          <div className="rounded-xl border border-line bg-surface p-4 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-text-secondary">
              <Shield className="size-4 text-navy-700" />
              Administrative Actions
            </div>
            <p className="mt-1 text-xs text-text-secondary">
              Enforce compliance on this partner. Suspending them disables new bookings and unlists active marketplace offerings.
            </p>

            {confirmAction === null ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {isSuspended ? (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => {
                      setConfirmAction("REINSTATE");
                      setActionError(null);
                    }}
                  >
                    <CheckCircle2 className="mr-1.5 size-4" />
                    Reinstate Partner
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={!isApproved && partner?.application_status !== "CHANGES_REQUIRED"}
                    onClick={() => {
                      setConfirmAction("SUSPEND");
                      setActionError(null);
                    }}
                  >
                    <ShieldAlert className="mr-1.5 size-4" />
                    Suspend Partner
                  </Button>
                )}

                <Link
                  href={
                    partner?.display_name
                      ? `/reviews?applicant=${encodeURIComponent(partner.display_name)}`
                      : "/reviews"
                  }
                  target="_blank"
                  className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-text hover:bg-surface-sunken"
                >
                  <ExternalLink className="size-3.5" />
                  View Application Review
                </Link>

                <Link
                  href="/operations/partners"
                  target="_blank"
                  className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-text hover:bg-surface-sunken"
                >
                  <ArrowRight className="size-3.5" />
                  Open in Directory
                </Link>
              </div>
            ) : (
              <div className="mt-3 space-y-3 rounded-lg border border-warning-line bg-warning-surface/30 p-3">
                <div className="flex items-center gap-1.5 text-xs font-bold text-navy-900">
                  <AlertTriangle className="size-4 text-warning-text" />
                  Confirm {confirmAction === "SUSPEND" ? "Partner Suspension" : "Partner Reinstatement"}
                </div>
                <p className="text-xs text-text-secondary">
                  {confirmAction === "SUSPEND"
                    ? "Explain why this partner is being suspended (e.g. fraudulent ads, reported safety violation, non-compliance). This is audited."
                    : "Confirm reinstating this partner to approved active standing."}
                </p>

                <Textarea
                  rows={2}
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  placeholder={
                    confirmAction === "SUSPEND"
                      ? "Enter required reason for suspension..."
                      : "Optional note for reinstatement..."
                  }
                  className="text-xs"
                />

                {actionError && <p className="text-xs text-danger-text">{actionError}</p>}

                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setConfirmAction(null);
                      setActionReason("");
                      setActionError(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    variant={confirmAction === "SUSPEND" ? "danger" : "primary"}
                    loading={transitionMutation.isPending}
                    onClick={handleAction}
                  >
                    {confirmAction === "SUSPEND" ? "Confirm Suspension" : "Confirm Reinstatement"}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Loading or Detailed Sections */}
          {record.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-xs text-text-muted">
              <Spinner size="sm" />
              Loading detailed partner records…
            </div>
          ) : partner ? (
            <>
              {/* Business Profile */}
              {partner.business_profile && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-text-secondary">
                    Business Profile & Tax
                  </h3>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg border border-line bg-surface p-2.5">
                      <span className="text-text-muted">Legal Name</span>
                      <p className="font-semibold text-navy-900">
                        {partner.business_profile.legal_name || "—"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-line bg-surface p-2.5">
                      <span className="text-text-muted">GSTIN</span>
                      <p className="font-semibold text-navy-900">
                        {partner.business_profile.gstin || "Not registered"}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Skills & Coverage */}
              {partner.skills && partner.skills.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-text-secondary">
                    Skills & Trade Qualifications
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {partner.skills.map((skill) => (
                      <span
                        key={skill.code}
                        className="rounded-full bg-surface-sunken px-2.5 py-1 text-xs font-medium text-text-secondary ring-1 ring-line"
                      >
                        {skill.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {partner.service_areas && partner.service_areas.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-text-secondary">
                    Operating Service Areas
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {partner.service_areas.map((area) => (
                      <span
                        key={area.code}
                        className="inline-flex items-center gap-1 rounded-full bg-surface-sunken px-2.5 py-1 text-xs font-medium text-text-secondary ring-1 ring-line"
                      >
                        <MapPin className="size-3 text-text-muted" />
                        {area.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Documents Status */}
              {partner.documents && partner.documents.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-text-secondary">
                    Verification Documents
                  </h3>
                  <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
                    {partner.documents.map((doc) => (
                      <li key={doc.id} className="flex items-center justify-between p-2.5 text-xs">
                        <span className="font-medium text-navy-900">{doc.kind.replace(/_/g, " ")}</span>
                        <Badge tone={STATUS_TONE[doc.status] ?? "neutral"}>{doc.status}</Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Transitions History */}
              {partner.transitions && partner.transitions.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-text-secondary">
                    Status History & Audits
                  </h3>
                  <div className="space-y-2 rounded-lg border border-line bg-surface p-3 text-xs">
                    {partner.transitions.map((t) => (
                      <div key={t.id} className="border-b border-line/50 pb-2 last:border-0 last:pb-0">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-navy-900">
                            {t.from_status || "INITIAL"} → {t.to_status}
                          </span>
                          <span className="text-[11px] text-text-muted">
                            {formatDate(t.occurred_at)}
                          </span>
                        </div>
                        {t.reason && (
                          <p className="mt-0.5 text-text-secondary italic">&ldquo;{t.reason}&rdquo;</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-line bg-surface-sunken/40 px-6 py-3">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
