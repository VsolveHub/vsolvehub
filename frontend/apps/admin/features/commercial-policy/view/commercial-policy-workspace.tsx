"use client";

import { friendlyErrorMessage } from "@vsolve/query";
import {
  Badge,
  Button,
  Card,
  ChoiceChips,
  ConfirmAction,
  ErrorState,
  Field,
  Input,
  Select,
  Spinner,
  formatMoney,
} from "@vsolve/ui";
import { Trash2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import {
  CHARGE_CODES,
  CHARGE_LABEL,
  bpsToPercent,
  categoryLabel,
  draftFrom,
  priceExample,
  rateRows,
  requiredCategories,
  toActivateBody,
  type ActivateBody,
  type CommercialPolicy,
  type PolicyDraft,
  type TaxCategoryUsage,
} from "../model";
import { useActivateCommercialPolicy, useCommercialPolicies, useTaxCategories } from "../queries";

/* -------------------------------------------------------------------------
   Words for the policy's codes
   ------------------------------------------------------------------------- */

const WHO: Record<string, string> = { PARTNER: "Partner", VSOLVE: "Vsolve" };
const FEE_PAYER: Record<string, string> = {
  NONE: "No fee",
  CUSTOMER: "Customer pays",
  PARTNER: "Partner pays",
};
const BASIS: Record<string, string> = {
  PARTNER_QUOTE: "partner's price including GST",
  TAXABLE_VALUE: "partner's price before GST",
  NONE: "off",
};
const TAX_BASIS: Record<string, string> = {
  EXCLUSIVE: "Added on top of the partner's price",
  INCLUSIVE: "Already inside the partner's price",
};

const options = (map: Record<string, string>, keys: string[]) =>
  keys.map((value) => ({ value, label: map[value] ?? value }));

/** The example the page explains everything with: ₹10,000 of work. */
const EXAMPLE_WORK_PAISE = 1_000_000;

function day(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleDateString("en-IN", { dateStyle: "medium" }) : "no end date";
}

function today(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

/** The category crew and project jobs are taxed under, for the worked example. */
function exampleCategory(usage: readonly TaxCategoryUsage[], draft: PolicyDraft): string {
  return (
    requiredCategories(usage)[0] ??
    draft.taxRates.find((row) => row.category.trim())?.category.trim() ??
    ""
  );
}

/* -------------------------------------------------------------------------
   Reading the policy in force
   ------------------------------------------------------------------------- */

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-control border border-line bg-surface px-3 py-2.5">
      <dt className="text-xs font-semibold text-text-secondary">{label}</dt>
      <dd className="mt-0.5 text-sm text-text">{children}</dd>
    </div>
  );
}

/** One job, in rupees: what the numbers mean for the customer, the partner and Vsolve. */
function MoneyExample({ draft, category }: { draft: PolicyDraft; category: string }) {
  const example = category ? priceExample(draft, { workPaise: EXAMPLE_WORK_PAISE, taxCategory: category }) : null;
  if (!example) {
    return (
      <p className="text-sm text-text-secondary">
        Fill in every percentage to see what a job would come to.
      </p>
    );
  }
  const rows: [string, number, string?][] = [
    ["Partner's price for the work", example.work],
    ["GST on the work (the partner pays it to the government)", example.partnerGst],
    ...(example.platformFee > 0
      ? ([[`Platform fee${draft.platformFeeTreatment === "PARTNER" ? " (taken from the partner)" : ""}`, example.platformFee]] as [string, number][])
      : []),
    ...(example.platformFeeGst > 0 ? ([["GST on the platform fee", example.platformFeeGst]] as [string, number][]) : []),
  ];
  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
      <dl className="grid gap-1 text-sm">
        {rows.map(([label, amount]) => (
          <div key={label} className="flex justify-between gap-4">
            <dt className="text-text-secondary">{label}</dt>
            <dd data-numeric className="text-text">
              {formatMoney(amount)}
            </dd>
          </div>
        ))}
      </dl>
      <dl className="grid grid-cols-3 gap-2 text-center lg:w-[26rem]">
        {(
          [
            ["Customer pays", example.customerPays, "bg-surface"],
            ["Partner gets", example.partnerReceives, "bg-success-surface"],
            ["Vsolve keeps", example.vsolveKeeps, "bg-info-surface"],
          ] as const
        ).map(([label, amount, tone]) => (
          <div key={label} className={`rounded-control border border-line px-2 py-2 ${tone}`}>
            <dt className="text-xs font-semibold text-text-secondary">{label}</dt>
            <dd data-numeric className="mt-0.5 text-base font-bold text-text">
              {formatMoney(amount)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function InForce({
  policy,
  usage,
  onChange,
}: {
  policy: CommercialPolicy;
  usage: readonly TaxCategoryUsage[];
  onChange: () => void;
}) {
  const rates = Object.entries((policy.tax_rates_bps ?? {}) as Record<string, number>);
  const usageOf = new Map(usage.map((row) => [row.code, row]));
  const devSeed = /seed|not an owner decision/i.test(policy.approval_reference);
  const asDraft = draftFrom(policy);
  // `draftFrom` writes the *next* version; the example only needs the numbers.
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold text-text">In force now</h3>
            <Badge tone="success">Version {policy.version}</Badge>
            {devSeed ? <Badge tone="warning">Test values — not approved by the owner</Badge> : null}
          </div>
          <p className="mt-1 text-sm text-text-secondary">
            Since {day(policy.effective_from)} · {day(policy.effective_until)} · approval “
            {policy.approval_reference}”
          </p>
        </div>
        <Button size="sm" onClick={onChange}>
          Change these numbers…
        </Button>
      </div>

      <dl className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Commission">
          <strong>{bpsToPercent(policy.commission_bps)}%</strong> of the{" "}
          {BASIS[policy.commission_basis] ?? policy.commission_basis}
        </Fact>
        <Fact label="Platform fee">
          {policy.platform_fee_treatment === "NONE" ? (
            "None"
          ) : (
            <>
              <strong>{bpsToPercent(policy.platform_fee_bps)}%</strong> + {bpsToPercent(policy.platform_fee_tax_bps)}%
              GST · {FEE_PAYER[policy.platform_fee_treatment]?.toLowerCase()}
            </>
          )}
        </Fact>
        <Fact label="TDS withheld">
          {policy.withholding_basis === "NONE" || policy.withholding_bps === 0 ? (
            "Off"
          ) : (
            <>
              <strong>{bpsToPercent(policy.withholding_bps)}%</strong> of the {BASIS[policy.withholding_basis]}
            </>
          )}
        </Fact>
        <Fact label="Invoice issued by">
          Work: {WHO[policy.supplier_of_record]} · Materials: {WHO[policy.material_supplier_of_record]} · Site
          visits: {WHO[policy.visit_supplier_of_record]}
        </Fact>
      </dl>

      <div className="mt-4">
        <p className="text-xs font-semibold text-text-secondary">
          GST rates · {TAX_BASIS[policy.tax_basis]?.toLowerCase() ?? policy.tax_basis}
        </p>
        <ul className="mt-1.5 flex list-none flex-wrap gap-1.5 p-0">
          {rates.map(([code, bps]) => {
            const used = usageOf.get(code);
            return (
              <li
                key={code}
                title={used ? `Used by ${used.service_count} services` : "No service uses this category"}
                className={`rounded-full border px-2.5 py-1 text-xs ${
                  used ? "border-line bg-surface text-text" : "border-dashed border-line text-text-muted"
                }`}
              >
                {categoryLabel(code)} <strong data-numeric>{bpsToPercent(bps)}%</strong>
                {used && used.crew_and_project_service_count > 0 ? " · crew & projects" : ""}
                {used ? "" : " · unused"}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="mt-4 rounded-card border border-line bg-surface-sunken p-4">
        <p className="mb-2 text-sm font-semibold text-text">
          Example: a {formatMoney(EXAMPLE_WORK_PAISE)} crew or project job, GST-registered partner
        </p>
        <MoneyExample draft={asDraft} category={exampleCategory(usage, asDraft)} />
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------
   Changing it
   ------------------------------------------------------------------------- */

function Section({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <section className="grid gap-3 border-t border-line pt-4 lg:grid-cols-[14rem_1fr] lg:gap-6">
      <div>
        <h4 className="text-sm font-bold text-text">{title}</h4>
        <p className="mt-0.5 text-xs leading-5 text-text-secondary">{hint}</p>
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function PercentInput({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <Field label={label} showOptional={false}>
      <div className="relative w-32">
        <Input
          inputMode="decimal"
          value={value}
          disabled={disabled}
          className="pr-8"
          onChange={(event) => onChange(event.target.value)}
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-text-muted">
          %
        </span>
      </div>
    </Field>
  );
}

function RateTable({
  draft,
  usage,
  onRate,
  onRemove,
}: {
  draft: PolicyDraft;
  usage: readonly TaxCategoryUsage[];
  onRate: (category: string, percent: string) => void;
  onRemove: (category: string) => void;
}) {
  const rows = rateRows(draft, usage);
  return (
    <div className="overflow-hidden rounded-control border border-line">
      <table className="w-full table-fixed border-collapse text-left text-sm">
        <thead className="bg-surface-sunken text-xs text-text-secondary">
          <tr>
            <th className="w-[34%] px-3 py-2 font-semibold">Tax category</th>
            <th className="px-3 py-2 font-semibold">Used by</th>
            <th className="w-40 px-3 py-2 font-semibold">GST rate</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => (
            <tr key={row.category} className="align-middle">
              <td className="px-3 py-2">
                <span className="block font-semibold text-text">{categoryLabel(row.category)}</span>
                <span className="block break-all font-mono text-xs text-text-muted">{row.category}</span>
              </td>
              <td className="px-3 py-2 text-text-secondary">
                {row.usage ? (
                  <>
                    {row.usage.service_count} {row.usage.service_count === 1 ? "service" : "services"}
                    {row.usage.crew_and_project_service_count > 0 ? (
                      <Badge tone="info" className="ml-1.5">
                        Crew &amp; projects
                      </Badge>
                    ) : null}
                    <span className="mt-0.5 block line-clamp-2 text-xs text-text-muted">
                      e.g. {row.usage.example_services.join(", ")}
                    </span>
                  </>
                ) : (
                  <span className="text-text-muted">No service uses this</span>
                )}
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-1">
                  <div className="relative w-24">
                    <Input
                      aria-label={`GST rate for ${categoryLabel(row.category)}`}
                      inputMode="decimal"
                      value={row.percent}
                      placeholder="—"
                      className="pr-7"
                      onChange={(event) => onRate(row.category, event.target.value)}
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-text-muted">
                      %
                    </span>
                  </div>
                  {row.usage ? null : (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Remove ${categoryLabel(row.category)}`}
                      onClick={() => onRemove(row.category)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * How crew and project jobs are charged: commission, platform fee, GST, TDS and who invoices.
 *
 * Every change is a new numbered version with a Finance/legal approval reference; activating it
 * retires the current one, and estimates already sent keep the numbers they were priced at. The
 * page reads the policy back as money on an example job, and offers the tax categories the
 * catalogue's services actually use rather than asking for their codes to be typed.
 */
export function CommercialPolicyWorkspace() {
  const policies = useCommercialPolicies();
  const taxCategories = useTaxCategories();
  const activate = useActivateCommercialPolicy();
  const rows = policies.data ?? [];
  const usage = taxCategories.data ?? [];
  const latest = rows[0];
  const active = rows.find((row) => row.status === "ACTIVE");
  const [draft, setDraft] = useState<PolicyDraft | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<ActivateBody | null>(null);

  const freshDraft = () => ({ ...draftFrom(latest), effectiveFrom: today() });

  useEffect(() => {
    if (policies.isSuccess && draft === null) setDraft({ ...draftFrom(latest), effectiveFrom: today() });
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
  const setRate = (category: string, percent: string) =>
    set({
      taxRates: draft.taxRates.some((row) => row.category.trim() === category)
        ? draft.taxRates.map((row) => (row.category.trim() === category ? { ...row, percent } : row))
        : [...draft.taxRates.filter((row) => row.category.trim()), { category, percent }],
    });
  const removeRate = (category: string) =>
    set({
      taxRates: draft.taxRates.filter((row) => row.category.trim() !== category),
      materialTaxCategory: draft.materialTaxCategory === category ? "" : draft.materialTaxCategory,
      chargeTaxCategories: Object.fromEntries(
        Object.entries(draft.chargeTaxCategories).filter(([, value]) => value !== category),
      ),
    });
  const priced = draft.taxRates.filter((row) => row.category.trim() && row.percent.trim());
  const pricedOptions = priced.map((row) => ({
    value: row.category.trim(),
    label: `${categoryLabel(row.category.trim())} (${row.percent}%)`,
  }));
  /** The priced categories, plus the current choice if it lost its rate — shown as such. */
  const optionsWith = (current: string) =>
    current && !pricedOptions.some((option) => option.value === current)
      ? [...pricedOptions, { value: current, label: `${categoryLabel(current)} (no rate)` }]
      : pricedOptions;
  const openEditor = () => {
    setDraft(freshDraft());
    setError(null);
    setEditing(true);
  };

  return (
    <div className="flex flex-col gap-4">
      {active ? (
        <InForce policy={active} usage={usage} onChange={openEditor} />
      ) : (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
          <p className="text-sm text-danger-text">
            No policy is active, so crew and project estimates cannot be priced.
          </p>
          <Button size="sm" onClick={openEditor}>
            Set the numbers…
          </Button>
        </Card>
      )}
      {taxCategories.isError ? (
        <p className="text-sm text-warning-text">
          The list of tax categories could not be loaded, so rates show without the services that use
          them. Reload to try again.
        </p>
      ) : null}

      {editing ? (
        <Card className="flex flex-col gap-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-text">New version {draft.version}</h3>
              <p className="mt-1 text-sm text-text-secondary">
                Starts from version {latest?.version ?? "—"}. Change only what Finance approved;
                nothing changes until you activate it.
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Close
            </Button>
          </div>

          <Section title="Approval" hint="The Finance or legal sign-off for these numbers, and when they start.">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Approval reference" showOptional={false} required className="sm:col-span-3">
                <Input
                  value={draft.approvalReference}
                  placeholder="e.g. FIN-2026-14"
                  maxLength={120}
                  onChange={(e) => set({ approvalReference: e.target.value })}
                />
              </Field>
              <Field label="Takes effect" showOptional={false} required>
                <Input type="date" value={draft.effectiveFrom} onChange={(e) => set({ effectiveFrom: e.target.value })} />
              </Field>
              <Field label="Ends" description="Leave empty to keep it running.">
                <Input type="date" value={draft.effectiveUntil} onChange={(e) => set({ effectiveUntil: e.target.value })} />
              </Field>
            </div>
          </Section>

          <Section title="Commission" hint="Vsolve's share of each job, taken from what the partner is paid.">
            <PercentInput label="Commission" value={draft.commissionPercent} onChange={(v) => set({ commissionPercent: v })} />
            <Field label="Worked out on the" showOptional={false}>
              <ChoiceChips
                label="Commission is worked out on"
                name="commission-basis"
                options={options(BASIS, ["TAXABLE_VALUE", "PARTNER_QUOTE"])}
                value={draft.commissionBasis}
                onChange={(v) => set({ commissionBasis: v })}
              />
            </Field>
          </Section>

          <Section title="Platform fee" hint="A separate fee on each job, with GST on it.">
            <Field label="Who pays it" showOptional={false}>
              <ChoiceChips
                label="Who pays the platform fee"
                name="platform-fee-payer"
                options={options(FEE_PAYER, ["NONE", "CUSTOMER", "PARTNER"])}
                value={draft.platformFeeTreatment}
                onChange={(v) => set({ platformFeeTreatment: v })}
              />
            </Field>
            {draft.platformFeeTreatment !== "NONE" ? (
              <div className="flex flex-wrap gap-3">
                <PercentInput label="Fee" value={draft.platformFeePercent} onChange={(v) => set({ platformFeePercent: v })} />
                <PercentInput label="GST on the fee" value={draft.platformFeeTaxPercent} onChange={(v) => set({ platformFeeTaxPercent: v })} />
              </div>
            ) : null}
          </Section>

          <Section title="TDS" hint="Income tax Vsolve withholds from the partner's payout and pays to the government.">
            <Field label="Withhold" showOptional={false}>
              <ChoiceChips
                label="TDS is worked out on"
                name="withholding-basis"
                options={[
                  { value: "NONE", label: "Off" },
                  { value: "TAXABLE_VALUE", label: "On the price before GST" },
                  { value: "PARTNER_QUOTE", label: "On the price including GST" },
                ]}
                value={draft.withholdingBasis}
                onChange={(v) => set({ withholdingBasis: v, withholdingPercent: v === "NONE" ? "0" : draft.withholdingPercent })}
              />
            </Field>
            {draft.withholdingBasis !== "NONE" ? (
              <PercentInput label="TDS rate" value={draft.withholdingPercent} onChange={(v) => set({ withholdingPercent: v })} />
            ) : null}
          </Section>

          <Section
            title="GST rates"
            hint="One rate per tax category. The categories come from your services, so there is nothing to type but the percentage."
          >
            <Field label="Partner prices" showOptional={false}>
              <ChoiceChips
                label="GST and the partner's price"
                name="tax-basis"
                options={options(TAX_BASIS, ["EXCLUSIVE", "INCLUSIVE"])}
                value={draft.taxBasis}
                onChange={(v) => set({ taxBasis: v })}
              />
            </Field>
            {taxCategories.isPending ? (
              <p className="flex items-center gap-2 text-sm text-text-secondary">
                <Spinner size="sm" /> Loading tax categories…
              </p>
            ) : (
              <RateTable draft={draft} usage={usage} onRate={setRate} onRemove={removeRate} />
            )}
          </Section>

          <Section title="Materials and extra charges" hint="Which GST rate each one is charged at. Only categories with a rate are offered.">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Materials" showOptional={false} required>
                <Select value={draft.materialTaxCategory} onChange={(e) => set({ materialTaxCategory: e.target.value })}>
                  <option value="">Choose a rate…</option>
                  {optionsWith(draft.materialTaxCategory).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
              {CHARGE_CODES.map((code) => (
                <Field key={code} label={CHARGE_LABEL[code] ?? code} showOptional={false}>
                  <Select
                    value={draft.chargeTaxCategories[code] ?? ""}
                    onChange={(e) => set({ chargeTaxCategories: { ...draft.chargeTaxCategories, [code]: e.target.value } })}
                  >
                    <option value="">Not allowed on estimates</option>
                    {optionsWith(draft.chargeTaxCategories[code] ?? "").map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              ))}
            </div>
          </Section>

          <Section title="Who issues the invoice" hint="The supplier named on the tax invoice for each part of a job.">
            <div className="grid gap-3 sm:grid-cols-3">
              {(
                [
                  ["The work", "supplierOfRecord"],
                  ["Materials", "materialSupplierOfRecord"],
                  ["Site visits", "visitSupplierOfRecord"],
                ] as const
              ).map(([label, key]) => (
                <Field key={key} label={label} showOptional={false}>
                  <ChoiceChips
                    label={`Who invoices ${label.toLowerCase()}`}
                    name={key}
                    layout="bar"
                    options={options(WHO, ["PARTNER", "VSOLVE"])}
                    value={draft[key]}
                    onChange={(v) => set({ [key]: v } as Partial<PolicyDraft>)}
                  />
                </Field>
              ))}
            </div>
          </Section>

          <div className="rounded-card border border-line bg-surface-sunken p-4">
            <p className="mb-2 text-sm font-semibold text-text">
              With these numbers: a {formatMoney(EXAMPLE_WORK_PAISE)} crew or project job, GST-registered partner
            </p>
            <MoneyExample draft={draft} category={exampleCategory(usage, draft)} />
          </div>

          {error ? (
            <p role="alert" className="text-sm text-danger-text">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => {
                const result = toActivateBody(draft, { required: requiredCategories(usage) });
                if ("error" in result) return setError(result.error);
                setError(null);
                activate.reset();
                setPending(result.body);
              }}
            >
              Review and activate version {draft.version}…
            </Button>
            <Button variant="ghost" onClick={() => setDraft(freshDraft())}>
              Undo my changes
            </Button>
          </div>
        </Card>
      ) : null}

      {rows.some((row) => row.status !== "ACTIVE") ? (
        <details className="rounded-card border border-line bg-surface px-5 py-3">
          <summary className="cursor-pointer text-sm font-semibold text-text">
            Earlier versions ({rows.filter((row) => row.status !== "ACTIVE").length})
          </summary>
          <ul className="mt-2 divide-y divide-line">
            {rows
              .filter((row) => row.status !== "ACTIVE")
              .map((row) => (
                <li key={row.id} className="py-2 text-sm text-text-secondary">
                  <span className="font-semibold text-text">Version {row.version}</span> ·{" "}
                  {row.status.toLowerCase()} · from {day(row.effective_from)} · approval “{row.approval_reference}”
                </li>
              ))}
          </ul>
        </details>
      ) : null}

      <ConfirmAction
        open={pending !== null}
        onOpenChange={(open) => (open ? null : setPending(null))}
        title={`Activate version ${pending?.version ?? ""}`}
        consequence="New crew and project estimates are priced with these numbers from the start date, and the current version is retired. Estimates already sent keep their numbers."
        confirmLabel="Activate"
        pending={activate.isPending}
        onConfirm={() =>
          pending &&
          activate.mutate(pending, {
            onSuccess: (saved) => {
              setPending(null);
              setEditing(false);
              setDraft({ ...draftFrom(saved), effectiveFrom: today() });
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
