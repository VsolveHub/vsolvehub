"use client";

import { Button, Sheet, cn, formatMoney } from "@vsolve/ui";
import { PackageCheck } from "lucide-react";

import {
  itemLineAmount,
  labourLineAmount,
  materialLineAmount,
  type CommercialEstimateDraft,
  type MaterialListLineDraft,
} from "../model/commercial-estimate-draft";
import type { ProposalFinancialSummary } from "../queries";

/**
 * The estimate as the customer will read it, before it is sent.
 *
 * The composer is a form; the customer gets a document. A vendor who has only
 * ever seen the form does not know that "Work — 1 job — ₹12,000" reads as a
 * bare line to somebody deciding between three estimates, or that a blank
 * "what you'll do" is the first thing they see. Same order as the customer's
 * page: the number, the scope, in and out, the lines, how they pay, the terms.
 * Money is the server's preview figure; the lines are the draft's own.
 */
export function EstimatePreviewSheet({
  open,
  onClose,
  draft,
  preview,
  vendorName,
  materialList = [],
  partnerTurnkey = false,
  title = "As the customer sees it",
  description = "This is the page they compare against the other estimates.",
  closeLabel = "Back to editing",
}: {
  open: boolean;
  onClose: () => void;
  draft: CommercialEstimateDraft;
  preview: Pick<ProposalFinancialSummary, "customer_total_paise"> | undefined;
  vendorName: string;
  /** What the customer buys — quantities and a spec, never a price (1.48.0). */
  materialList?: readonly MaterialListLineDraft[];
  partnerTurnkey?: boolean;
  title?: string;
  description?: string;
  closeLabel?: string;
}) {
  const lines =
    draft.mode === "ITEM_WISE"
      ? draft.itemLines.map((line) => ({ title: line.title || "Untitled", note: `${line.quantity} × ${formatMoney(line.ratePaise ?? 0)}`, amount: itemLineAmount(line) }))
      : draft.labourLines.map((line) => ({ title: line.team ? `${line.role} — ${line.team}` : line.role || "Untitled", note: `${line.memberCount} people × ${line.dayCount} days × ${formatMoney(line.ratePaisePerDay ?? 0)}/day`, amount: labourLineAmount(line) }));
  const first = draft.installments[0] ?? null;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => { if (!next) onClose(); }}
      title={title}
      description={description}
      footer={<Button onClick={onClose}>{closeLabel}</Button>}
    >
      <div className="flex flex-col gap-3 text-text">
        <div className="rounded-[14px] bg-navy-900 p-4 text-surface">
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-signal-300">{vendorName}</p>
          <p className="mt-1 text-[28px] font-extrabold leading-none tabular-nums">
            {preview ? formatMoney(preview.customer_total_paise) : "—"}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 border-t border-surface/15 pt-3 text-sm">
            <div>
              <p className="text-[11px] uppercase text-surface/60">Pay to start</p>
              <p className="font-bold">{first?.amountPaise ? formatMoney(first.amountPaise) : "Not stated"}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase text-surface/60">Timeline</p>
              <p className="font-bold">{draft.installments.at(-1)?.endsOn ? `Ends ${draft.installments.at(-1)!.endsOn}` : "Not dated"}</p>
            </div>
          </div>
        </div>

        {partnerTurnkey ? (
          <div className="flex gap-3 rounded-card border border-success-line bg-success-surface p-3 text-success-text">
            <PackageCheck className="mt-0.5 size-5 shrink-0" aria-hidden />
            <div>
              <p className="text-sm font-bold">Materials, setup and removal included</p>
              <p className="mt-0.5 text-xs leading-5">
                The decorator manages the full supply. You do not need to shop for décor materials.
              </p>
            </div>
          </div>
        ) : null}

        <Block title="What you get">
          {draft.scopeSummary.trim() === "" ? (
            <p className="text-sm text-warning-text">You have not said what you will do. This is the first thing they read.</p>
          ) : (
            <p className="text-sm leading-6">“{draft.scopeSummary.trim()}”</p>
          )}
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <ul className="list-none p-0">
              {draft.inclusions.filter(Boolean).map((line) => (
                <li key={line} className="flex gap-1.5"><span className="text-success-text">✓</span>{line}</li>
              ))}
              {draft.inclusions.filter(Boolean).length === 0 ? <li className="text-text-muted">Nothing marked as included</li> : null}
            </ul>
            <ul className="list-none p-0">
              {draft.exclusions.filter(Boolean).map((line) => (
                <li key={line} className="flex gap-1.5"><span className="text-warm-500">✗</span>{line}</li>
              ))}
            </ul>
          </div>
        </Block>

        <Block title={`How the price is built${draft.mode === "ITEM_WISE" ? " — item-wise" : draft.mode === "LABOUR_WISE" ? " — labour-wise" : ""}`}>
          <ul className="list-none divide-y divide-line p-0 text-sm">
            {lines.map((line, index) => (
              <li key={index} className="flex justify-between gap-3 py-1.5">
                <span><span className="font-medium">{line.title}</span><span className="block text-xs text-text-muted">{line.note}</span></span>
                <span className="font-semibold tabular-nums">{line.amount === null ? "—" : formatMoney(line.amount)}</span>
              </li>
            ))}
            {draft.otherCharges.map((charge) => (
              <li key={charge.id} className="flex justify-between gap-3 py-1.5"><span>{charge.label || "Named charge"}</span><span className="font-semibold tabular-nums">{charge.amountPaise === null ? "—" : formatMoney(charge.amountPaise)}</span></li>
            ))}
            {draft.materialLines.map((material) => (
              <li key={material.id} className="flex justify-between gap-3 py-1.5"><span>{material.title || "Material"}<span className="block text-xs text-text-muted">Material, paid as an advance</span></span><span className="font-semibold tabular-nums">{materialLineAmount(material) === null ? "—" : formatMoney(materialLineAmount(material)!)}</span></li>
            ))}
          </ul>
        </Block>

        {materialList.length > 0 ? (
          <Block title={partnerTurnkey ? "Materials & finish included" : "What you need to buy"}>
            <p className="text-xs text-text-muted">
              {partnerTurnkey
                ? "Supplied, installed and managed by the decorator · already inside the estimate"
                : `${
                    draft.materialBrandTier === "PREMIUM"
                      ? "Premium brands"
                      : draft.materialBrandTier === "STANDARD"
                        ? "Standard brands"
                        : "Any brand"
                  } · you buy these, the estimate covers the work`}
            </p>
            <ul className="mt-1 list-none divide-y divide-line p-0 text-sm">
              {materialList.map((row) => (
                <li key={`${row.title}|${row.unit}`} className="flex justify-between gap-3 py-1.5">
                  <span>
                    <span className="font-medium">{row.title}</span>
                    {row.spec ? <span className="block text-xs text-text-muted">{row.spec}</span> : null}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">
                    {row.quantity} {row.unit}
                  </span>
                </li>
              ))}
            </ul>
          </Block>
        ) : null}

        <Block title="How they pay">
          <ol className="list-none p-0 text-sm">
            {draft.installments.map((row, index) => (
              <li key={row.id} className="flex justify-between gap-3 py-1"><span>{index + 1}. {row.title || `Stage ${index + 1}`}{row.deliverable ? <span className="block text-xs text-text-muted">{row.deliverable}</span> : null}</span><span className="font-semibold tabular-nums">{row.amountPaise === null ? "—" : formatMoney(row.amountPaise)}</span></li>
            ))}
          </ol>
        </Block>

        <Block title="Terms">
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div><dt className="text-xs text-text-muted">Warranty</dt><dd className={cn(draft.warrantyTerms.trim() === "" && "text-warning-text")}>{draft.warrantyTerms.trim() || "Not stated"}</dd></div>
            <div><dt className="text-xs text-text-muted">Valid until</dt><dd className={cn(draft.validUntil === null && "text-warning-text")}>{draft.validUntil ? draft.validUntil.slice(0, 10) : "No validity given"}</dd></div>
          </dl>
        </Block>
      </div>
    </Sheet>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-line bg-surface p-3">
      <h3 className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-text-muted">{title}</h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}
