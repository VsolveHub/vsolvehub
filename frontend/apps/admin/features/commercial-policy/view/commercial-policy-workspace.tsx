"use client";

import { friendlyErrorMessage } from "@vsolve/query";
import { Badge, Button, Card, ConfirmAction, ErrorState, Field, Input, Select, Spinner } from "@vsolve/ui";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import {
  CHARGE_CODES,
  CHARGE_LABEL,
  bpsToPercent,
  draftFrom,
  toActivateBody,
  type ActivateBody,
  type CommercialPolicy,
  type PolicyDraft,
} from "../model";
import { useActivateCommercialPolicy, useCommercialPolicies } from "../queries";

const WHO = { PARTNER: "The partner", VSOLVE: "Vsolve" } as Record<string, string>;
const FEE_PAYER = { NONE: "No platform fee", CUSTOMER: "Customer pays it", PARTNER: "Partner pays it" } as Record<string, string>;
const BASIS = {
  PARTNER_QUOTE: "the partner's quote",
  TAXABLE_VALUE: "the taxable value",
  NONE: "nothing (off)",
} as Record<string, string>;
const TAX_BASIS = { EXCLUSIVE: "Added on top of partner rates", INCLUSIVE: "Included in partner rates" } as Record<string, string>;

function day(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleDateString("en-IN", { dateStyle: "medium" }) : "open-ended";
}

/** The policy in force, read as sentences rather than a table of basis points. */
function PolicySummary({ policy }: { policy: CommercialPolicy }) {
  const rates = Object.entries((policy.tax_rates_bps ?? {}) as Record<string, number>);
  return (
    <dl className="grid gap-3 text-sm sm:grid-cols-2">
      <div>
        <dt className="text-text-muted">Commission</dt>
        <dd>{bpsToPercent(policy.commission_bps)}% of {BASIS[policy.commission_basis] ?? policy.commission_basis}</dd>
      </div>
      <div>
        <dt className="text-text-muted">Platform fee</dt>
        <dd>
          {FEE_PAYER[policy.platform_fee_treatment] ?? policy.platform_fee_treatment}
          {policy.platform_fee_treatment !== "NONE"
            ? ` · ${bpsToPercent(policy.platform_fee_bps)}% + ${bpsToPercent(policy.platform_fee_tax_bps)}% tax`
            : ""}
        </dd>
      </div>
      <div>
        <dt className="text-text-muted">Tax</dt>
        <dd>
          {TAX_BASIS[policy.tax_basis] ?? policy.tax_basis} ·{" "}
          {rates.map(([category, bps]) => `${category} ${bpsToPercent(bps)}%`).join(", ")}
        </dd>
      </div>
      <div>
        <dt className="text-text-muted">Withholding (TDS)</dt>
        <dd>{bpsToPercent(policy.withholding_bps)}% of {BASIS[policy.withholding_basis] ?? policy.withholding_basis}</dd>
      </div>
      <div>
        <dt className="text-text-muted">Who invoices</dt>
        <dd>
          Work: {WHO[policy.supplier_of_record]} · Materials: {WHO[policy.material_supplier_of_record]} · Site visits:{" "}
          {WHO[policy.visit_supplier_of_record]}
        </dd>
      </div>
      <div>
        <dt className="text-text-muted">In force</dt>
        <dd>
          {day(policy.effective_from)} – {day(policy.effective_until)} · approval {policy.approval_reference}
        </dd>
      </div>
    </dl>
  );
}

function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Record<string, string>;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <Select value={value} onChange={(event) => onChange(event.target.value)}>
        {Object.entries(options).map(([key, text]) => (
          <option key={key} value={key}>
            {text}
          </option>
        ))}
      </Select>
    </Field>
  );
}

/**
 * How workforce and project jobs are charged: commission, platform fee, tax and TDS.
 *
 * Every change is a new numbered version with a Finance/legal approval reference. Activating it
 * retires the current one; estimates already sent keep the numbers they were priced at.
 */
export function CommercialPolicyWorkspace() {
  const policies = useCommercialPolicies();
  const activate = useActivateCommercialPolicy();
  const rows = policies.data ?? [];
  const latest = rows[0];
  const active = rows.find((row) => row.status === "ACTIVE");
  const [draft, setDraft] = useState<PolicyDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<ActivateBody | null>(null);

  useEffect(() => {
    if (policies.isSuccess && draft === null) setDraft(draftFrom(latest));
  }, [policies.isSuccess, latest, draft]);

  if (policies.isPending || draft === null) {
    return (
      <p className="flex items-center gap-2 text-sm text-text-secondary">
        <Spinner size="sm" /> Loading the commercial policy…
      </p>
    );
  }
  if (policies.isError) {
    return <ErrorState title="The policy could not be loaded" message="Nothing has changed. Try again." />;
  }

  const set = (patch: Partial<PolicyDraft>) => setDraft({ ...draft, ...patch });
  const categories = draft.taxRates.map((row) => row.category.trim()).filter(Boolean);
  const categoryOptions = Object.fromEntries([["", "Not charged"], ...categories.map((c) => [c, c])]);

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-bold text-text">In force now</h2>
          {active ? <Badge tone="success">Version {active.version}</Badge> : <Badge tone="danger">None</Badge>}
        </div>
        <div className="mt-3">
          {active ? (
            <PolicySummary policy={active} />
          ) : (
            <p className="text-sm text-danger-text">
              No policy is active, so workforce and project estimates cannot be priced. Activate one
              below.
            </p>
          )}
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-base font-bold text-text">Activate a new version</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Prefilled from version {latest?.version ?? "—"}. Change what Finance approved, add the
          approval reference, then activate.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <Field label="Version" required>
            <Input inputMode="numeric" value={draft.version} onChange={(e) => set({ version: e.target.value })} />
          </Field>
          <Field label="Approval reference" required className="sm:col-span-3">
            <Input value={draft.approvalReference} placeholder="e.g. FIN-2026-14" onChange={(e) => set({ approvalReference: e.target.value })} />
          </Field>
          <Field label="Takes effect" required className="sm:col-span-2">
            <Input type="date" value={draft.effectiveFrom} onChange={(e) => set({ effectiveFrom: e.target.value })} />
          </Field>
          <Field label="Ends (optional)" className="sm:col-span-2">
            <Input type="date" value={draft.effectiveUntil} onChange={(e) => set({ effectiveUntil: e.target.value })} />
          </Field>
        </div>

        <h3 className="mt-6 text-sm font-bold uppercase tracking-wider text-text-secondary">Commission and fees</h3>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          <Field label="Commission %">
            <Input inputMode="decimal" value={draft.commissionPercent} onChange={(e) => set({ commissionPercent: e.target.value })} />
          </Field>
          <Choice label="Commission is a share of" value={draft.commissionBasis} options={BASIS} onChange={(v) => set({ commissionBasis: v })} />
          <Choice label="Platform fee" value={draft.platformFeeTreatment} options={FEE_PAYER} onChange={(v) => set({ platformFeeTreatment: v })} />
          <Field label="Platform fee %">
            <Input inputMode="decimal" value={draft.platformFeePercent} onChange={(e) => set({ platformFeePercent: e.target.value })} />
          </Field>
          <Field label="Tax on platform fee %">
            <Input inputMode="decimal" value={draft.platformFeeTaxPercent} onChange={(e) => set({ platformFeeTaxPercent: e.target.value })} />
          </Field>
          <div />
          <Field label="Withholding (TDS) %">
            <Input inputMode="decimal" value={draft.withholdingPercent} onChange={(e) => set({ withholdingPercent: e.target.value })} />
          </Field>
          <Choice label="Withholding is a share of" value={draft.withholdingBasis} options={BASIS} onChange={(v) => set({ withholdingBasis: v })} />
        </div>

        <h3 className="mt-6 text-sm font-bold uppercase tracking-wider text-text-secondary">Tax</h3>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          <Choice label="Tax is" value={draft.taxBasis} options={TAX_BASIS} onChange={(v) => set({ taxBasis: v })} />
        </div>
        <div className="mt-3 flex flex-col gap-2">
          {draft.taxRates.map((row, index) => (
            <div key={index} className="flex flex-wrap items-end gap-2">
              <Field label="Tax category">
                <Input
                  value={row.category}
                  placeholder="e.g. labour"
                  onChange={(e) =>
                    set({ taxRates: draft.taxRates.map((r, i) => (i === index ? { ...r, category: e.target.value } : r)) })
                  }
                />
              </Field>
              <Field label="Rate %">
                <Input
                  inputMode="decimal"
                  className="w-24"
                  value={row.percent}
                  onChange={(e) =>
                    set({ taxRates: draft.taxRates.map((r, i) => (i === index ? { ...r, percent: e.target.value } : r)) })
                  }
                />
              </Field>
              <Button
                variant="ghost"
                aria-label="Remove this rate"
                disabled={draft.taxRates.length === 1}
                onClick={() => set({ taxRates: draft.taxRates.filter((_, i) => i !== index) })}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <div>
            <Button size="sm" variant="outline" onClick={() => set({ taxRates: [...draft.taxRates, { category: "", percent: "" }] })}>
              <Plus className="size-4" /> Add a rate
            </Button>
          </div>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Choice
            label="Materials are taxed as"
            value={draft.materialTaxCategory}
            options={Object.fromEntries([["", "Choose…"], ...categories.map((c) => [c, c])])}
            onChange={(v) => set({ materialTaxCategory: v })}
          />
          {CHARGE_CODES.map((code) => (
            <Choice
              key={code}
              label={`${CHARGE_LABEL[code]} taxed as`}
              value={draft.chargeTaxCategories[code] ?? ""}
              options={categoryOptions}
              onChange={(v) => set({ chargeTaxCategories: { ...draft.chargeTaxCategories, [code]: v } })}
            />
          ))}
        </div>

        <h3 className="mt-6 text-sm font-bold uppercase tracking-wider text-text-secondary">Who invoices</h3>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          <Choice label="The work" value={draft.supplierOfRecord} options={WHO} onChange={(v) => set({ supplierOfRecord: v })} />
          <Choice label="Materials" value={draft.materialSupplierOfRecord} options={WHO} onChange={(v) => set({ materialSupplierOfRecord: v })} />
          <Choice label="Site visits" value={draft.visitSupplierOfRecord} options={WHO} onChange={(v) => set({ visitSupplierOfRecord: v })} />
        </div>

        {error ? (
          <p role="alert" className="mt-4 text-sm text-danger-text">
            {error}
          </p>
        ) : null}
        <div className="mt-4 flex gap-2">
          <Button
            onClick={() => {
              const result = toActivateBody(draft);
              if ("error" in result) return setError(result.error);
              setError(null);
              activate.reset();
              setPending(result.body);
            }}
          >
            Review and activate
          </Button>
          <Button variant="ghost" onClick={() => setDraft(draftFrom(latest))}>
            Reset to version {latest?.version ?? "—"}
          </Button>
        </div>
      </Card>

      {rows.length > 1 ? (
        <Card className="p-5">
          <h2 className="text-base font-bold text-text">Earlier versions</h2>
          <ul className="mt-2 divide-y divide-line">
            {rows
              .filter((row) => row.status !== "ACTIVE")
              .map((row) => (
                <li key={row.id} className="py-2 text-sm">
                  Version {row.version} · {row.status.toLowerCase()} · approval {row.approval_reference} · from{" "}
                  {day(row.effective_from)}
                </li>
              ))}
          </ul>
        </Card>
      ) : null}

      <ConfirmAction
        open={pending !== null}
        onOpenChange={(open) => (open ? null : setPending(null))}
        title={`Activate version ${pending?.version ?? ""}`}
        consequence="New workforce and project estimates are priced with these numbers from now on, and the current version is retired. Estimates already sent keep their numbers."
        confirmLabel="Activate"
        pending={activate.isPending}
        onConfirm={() =>
          pending &&
          activate.mutate(pending, {
            onSuccess: (saved) => {
              setPending(null);
              setDraft(draftFrom(saved));
            },
          })
        }
      >
        {activate.isError ? (
          <p role="alert" className="text-sm text-danger-text">
            {friendlyErrorMessage(activate.error)}
          </p>
        ) : null}
      </ConfirmAction>
    </div>
  );
}
