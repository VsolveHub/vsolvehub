"use client";

import { friendlyErrorMessage } from "@vsolve/query";
import { Badge, Button, Card, ConfirmAction, Field, Input, Select, Spinner, Textarea, formatMoney } from "@vsolve/ui";
import { useMemo, useState } from "react";

import { usePartnerDirectory } from "@/features/partners/queries";

import {
  RECOVERY_REASONS,
  hasDisputedMilestone,
  transferQuotes,
  transferableMilestones,
} from "../model/project-recovery";
import { useOperationsProject, useProposeProjectTransfer, useTerminateProject } from "../queries";

const STAGE_LABEL: Record<string, string> = {
  PENDING: "Not started",
  IN_PROGRESS: "In progress",
  AWAITING_REVIEW: "Waiting for customer",
  APPROVED: "Approved",
  CORRECTION_REQUESTED: "Being corrected",
  DISPUTED: "Disputed",
  RELEASED: "Paid out",
  CANCELLED: "Cancelled",
};

/**
 * When a project vendor walks away: hand the unfinished milestones to another vendor (the
 * customer must accept the new prices), or end the project and refund unearned money.
 */
export function ProjectRecovery({ engagementId }: { engagementId: string }) {
  const project = useOperationsProject(engagementId);
  const transfer = useProposeProjectTransfer(engagementId);
  const terminate = useTerminateProject(engagementId);
  const directory = usePartnerDirectory({ status: "APPROVED" });
  const [mode, setMode] = useState<"none" | "transfer" | "terminate">("none");
  const [partnerId, setPartnerId] = useState("");
  const [reason, setReason] = useState("vendor_abandoned");
  const [note, setNote] = useState("");
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const partners = useMemo(() => directory.data?.pages.flatMap((page) => page.results) ?? [], [directory.data]);

  if (project.isPending) {
    return (
      <Card className="flex items-center gap-2 p-4 text-sm text-text-secondary">
        <Spinner size="sm" /> Loading the project…
      </Card>
    );
  }
  if (project.isError || !project.data) return null;

  const plan = project.data;
  const open = transferableMilestones(plan.milestones);
  const disputed = hasDisputedMilestone(plan.milestones);
  const finished = ["CANCELLED", "CLOSED", "COMPLETED", "WARRANTY", "COMPLETING"].includes(plan.status);

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-text">Project</h2>
        <Badge tone={finished ? "neutral" : "info"}>{plan.status.replaceAll("_", " ").toLowerCase()}</Badge>
      </div>
      <p className="mt-1 text-sm text-text-secondary">
        {formatMoney(plan.total_paise)} agreed · {formatMoney(plan.funded_total_paise)} paid in ·{" "}
        {formatMoney(plan.released_total_paise)} paid to the vendor
      </p>
      <ul className="mt-3 divide-y divide-line">
        {plan.milestones.map((m) => (
          <li key={m.stage_id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <span>
              {m.position}. {m.milestone_label}
              {m.kind === "MATERIAL_ADVANCE" ? " (materials advance)" : ""}
            </span>
            <span className="flex items-center gap-2">
              <span data-numeric>{formatMoney(m.amount_paise)}</span>
              <Badge tone={m.status === "DISPUTED" ? "danger" : "neutral"}>{STAGE_LABEL[m.status] ?? m.status}</Badge>
            </span>
          </li>
        ))}
      </ul>
      {plan.transfer ? (
        <p className="mt-3 rounded-card bg-surface-sunken p-3 text-sm">
          A move to another vendor is {plan.transfer.status.replaceAll("_", " ").toLowerCase()}.
        </p>
      ) : null}

      {finished || plan.transfer?.status === "PROPOSED" ? null : (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant={mode === "transfer" ? "primary" : "outline"} onClick={() => setMode("transfer")}>
              Move to another vendor
            </Button>
            <Button variant={mode === "terminate" ? "danger" : "outline"} onClick={() => setMode("terminate")}>
              End the project
            </Button>
          </div>

          {mode !== "none" ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Why" required>
                <Select value={reason} onChange={(e) => setReason(e.target.value)}>
                  {Object.entries(RECOVERY_REASONS).map(([code, label]) => (
                    <option key={code} value={code}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Note" className="sm:col-span-2">
                <Textarea value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
              </Field>
            </div>
          ) : null}

          {mode === "transfer" ? (
            disputed ? (
              <p className="mt-3 text-sm text-warning-text">
                A milestone is disputed. Decide it from its case first; a move cannot go around a dispute.
              </p>
            ) : (
              <div className="mt-3 flex flex-col gap-3">
                <Field label="New vendor" required>
                  <Select value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
                    <option value="">Choose…</option>
                    {partners.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.display_name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <p className="text-sm text-text-secondary">
                  The new vendor&apos;s price for each unfinished milestone. The customer sees both
                  totals and must accept before anything moves.
                </p>
                {open.map((m) => (
                  <Field key={m.stage_id} label={`${m.milestone_label} (was ${formatMoney(m.amount_paise)}) ₹`} required>
                    <Input
                      inputMode="decimal"
                      value={prices[m.stage_id] ?? ""}
                      onChange={(e) => setPrices({ ...prices, [m.stage_id]: e.target.value })}
                    />
                  </Field>
                ))}
                <div>
                  <Button
                    loading={transfer.isPending}
                    onClick={() => {
                      if (!partnerId) return setError("Choose the new vendor.");
                      const result = transferQuotes(open, prices);
                      if ("error" in result) return setError(result.error);
                      setError(null);
                      transfer.mutate({ to_partner_id: partnerId, reason_code: reason, note: note.trim(), quotes: result.quotes });
                    }}
                  >
                    Send to customer to accept
                  </Button>
                </div>
              </div>
            )
          ) : null}

          {mode === "terminate" ? (
            <div className="mt-3">
              <p className="text-sm text-text-secondary">
                Unfinished work milestones that were paid in are refunded to the customer. A paid
                materials advance stays with the vendor and becomes an open balance to resolve.
              </p>
              <Button className="mt-3" variant="danger" onClick={() => setConfirmEnd(true)}>
                End the project
              </Button>
            </div>
          ) : null}
        </>
      )}

      {error ? (
        <p role="alert" className="mt-3 text-sm text-danger-text">
          {error}
        </p>
      ) : null}
      {transfer.isError ? (
        <p role="alert" className="mt-3 text-sm text-danger-text">
          {friendlyErrorMessage(transfer.error)}
        </p>
      ) : null}
      {transfer.isSuccess ? (
        <p className="mt-3 text-sm text-success-text">Sent. The customer has to accept the new prices.</p>
      ) : null}

      <ConfirmAction
        open={confirmEnd}
        onOpenChange={setConfirmEnd}
        title="End this project"
        consequence="The project is cancelled and the request closes. Unearned paid-in money for work milestones is refunded. This cannot be undone."
        confirmLabel="End the project"
        destructive
        pending={terminate.isPending}
        onConfirm={() =>
          terminate.mutate({ reason_code: reason, note: note.trim() }, { onSuccess: () => setConfirmEnd(false) })
        }
      >
        {terminate.isError ? (
          <p role="alert" className="text-sm text-danger-text">
            {friendlyErrorMessage(terminate.error)}
          </p>
        ) : null}
      </ConfirmAction>
    </Card>
  );
}
