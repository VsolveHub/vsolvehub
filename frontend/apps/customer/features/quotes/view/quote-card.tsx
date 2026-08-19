"use client";

import { Badge, Button } from "@vsolve/ui";

import type { QuoteCardView } from "../adapters";

/**
 * One quote or estimate, read in full — `M2-FE-407`, `M2-FE-405`,
 * `M2-FE-413`, `M2-FE-423`.
 *
 * ## There is no paywall state in this component, and there must never be one
 *
 * `M2-FE-423`. Under revision 3 the A5 visit plan **is** the access fee: the
 * Customer bought a professional standing in their home and writing this down,
 * and every line of it is theirs to read. A "see more" gate here — on the scope,
 * the material lines, the stages, the exclusions — would be revision 2 rebuilt
 * inside a component, and the wave would be wrong.
 *
 * The same holds for A3 after the unlock. The entitlement is checked once, by
 * the server, before the payload is constructed; nothing downstream re-decides
 * it.
 *
 * ## What is deliberately not here
 *
 * Contact details. They are absent from the response at every status because
 * they are released by the **engagement**, not by the fee — so there is nothing
 * to withhold, which is stronger than a component choosing not to render them.
 */

export interface QuoteCardProps {
  card: QuoteCardView;
  /** Position in the list, for the accessible heading. */
  index: number;

  /** Hidden entirely once anything is selected. See `SelectionStatus`. */
  onSelect?: (proposalId: string) => void;
  isSelecting: boolean;

  onReject?: (proposalId: string) => void;
  /** `M2-FE-413` — offered only on an expired quote, and it charges nothing. */
  onRevalidate?: (proposalId: string) => void;
  isRevalidating: boolean;
}

export function QuoteCard({
  card,
  index,
  onSelect,
  isSelecting,
  onReject,
  onRevalidate,
  isRevalidating,
}: QuoteCardProps) {
  const headingId = `quote-${card.proposalId}`;

  return (
    <article
      // The comparison table's "Read it" links here. `scroll-mt` keeps the
      // heading clear of the sticky page chrome when it does.
      id={`estimate-${card.proposalId}`}
      aria-labelledby={headingId}
      className="scroll-mt-6 rounded-card border border-line bg-surface p-4"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={headingId} className="font-semibold text-text">
            {card.vendorName ?? `Quote ${index + 1}`}
          </h3>
          <p className="mt-0.5 text-sm text-text-secondary">
            {[card.vendorType, card.revision > 1 ? `Revision ${card.revision}` : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {card.isVerified ? <Badge tone="success">Verified</Badge> : null}
          {card.isOutOfBudget ? <Badge tone="warning">Over budget</Badge> : null}
          {card.isExpired ? <Badge tone="neutral">Price expired</Badge> : null}
        </div>
      </header>

      {/* `M2-FE-405`. Labelled, kept, and explained — never hidden and never
          presented as an ordinary option beside the ones inside the band. */}
      {card.isOutOfBudget ? (
        <p className="mt-3 rounded-card border border-warning-line bg-warning-surface p-3 text-sm leading-6 text-text">
          This is above the budget you told us. We are showing it rather than
          hiding it — the professional may be pricing something the cheaper
          quotes left out.
        </p>
      ) : null}

      <div className="mt-4">
        <p className="text-2xl font-semibold text-text">{card.payableLabel}</p>
        <p className="mt-0.5 text-sm text-text-secondary">
          {card.taxBasis === "INCLUSIVE"
            ? `Includes ${card.taxLabel} tax`
            : `${card.totalLabel} plus ${card.taxLabel} tax`}
        </p>
      </div>

      {card.rateLabel !== null ? (
        <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
          <Fact label="Per worker, per day" value={card.rateLabel} />
          <Fact
            label="Workers"
            value={card.workerCount === null ? null : String(card.workerCount)}
          />
          <Fact
            label="Minimum booking"
            value={
              card.minimumDays === null
                ? null
                : card.minimumDays === 1
                  ? "1 day"
                  : `${card.minimumDays} days`
            }
          />
        </dl>
      ) : null}

      {card.stages.length > 0 ? (
        <section className="mt-4">
          <h4 className="text-sm font-semibold text-text">How the work is staged</h4>
          <ol className="mt-2 flex list-none flex-col gap-2 p-0">
            {card.stages.map((stage, stageIndex) => (
              <li
                key={`${card.proposalId}-stage-${stageIndex}`}
                className="flex items-start justify-between gap-3 rounded-card border border-line p-3"
              >
                <div className="min-w-0">
                  <p className="font-medium text-text">
                    {stage.title === "" ? `Stage ${stageIndex + 1}` : stage.title}
                  </p>
                  {stage.deliverable !== null ? (
                    <p className="mt-0.5 text-sm text-text-secondary">{stage.deliverable}</p>
                  ) : null}
                  {stage.endsOn !== null ? (
                    <p className="mt-0.5 text-sm text-text-secondary">By {stage.endsOn}</p>
                  ) : null}
                </div>
                <p className="shrink-0 font-medium text-text">{stage.amountLabel}</p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <LineSection title="What is included" lines={card.inclusions} />
      <LineSection
        title="What is not included"
        lines={card.exclusions}
        emptyNote="They did not list anything as excluded. Ask before you choose if something matters to you."
      />

      {card.warrantyTerms !== null ? (
        <section className="mt-4">
          <h4 className="text-sm font-semibold text-text">Warranty</h4>
          <p className="mt-1 max-w-prose whitespace-pre-line text-sm leading-6 text-text-secondary">
            {card.warrantyTerms}
          </p>
        </section>
      ) : null}

      <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
        <Fact label="Valid until" value={card.validUntil} />
        <Fact label="Commission" value={card.commissionTreatment} />
        <Fact
          label="From a site visit"
          value={card.visitCompletedAt === null ? null : card.visitCompletedAt}
        />
      </dl>

      <QuoteActions
        card={card}
        onSelect={onSelect}
        isSelecting={isSelecting}
        onReject={onReject}
        onRevalidate={onRevalidate}
        isRevalidating={isRevalidating}
      />
    </article>
  );
}

function Fact({ label, value }: { label: string; value: string | null }) {
  if (value === null) return null;
  return (
    <div>
      <dt className="text-sm text-text-secondary">{label}</dt>
      <dd className="mt-0.5 text-text">{value}</dd>
    </div>
  );
}

/**
 * A list the vendor wrote, or an honest note that they wrote none.
 *
 * `emptyNote` exists because a blank "What is not included" is a genuinely
 * different fact from a blank "What is included": one means everything you
 * expected may be extra, and silence there is how a Customer is surprised by an
 * invoice.
 */
function LineSection({
  title,
  lines,
  emptyNote,
}: {
  title: string;
  lines: readonly string[];
  emptyNote?: string;
}) {
  if (lines.length === 0 && emptyNote === undefined) return null;
  return (
    <section className="mt-4">
      <h4 className="text-sm font-semibold text-text">{title}</h4>
      {lines.length === 0 ? (
        <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">{emptyNote}</p>
      ) : (
        <ul className="mt-1 flex list-disc flex-col gap-1 pl-5">
          {lines.map((line, lineIndex) => (
            <li key={`${title}-${lineIndex}`} className="text-sm leading-6 text-text-secondary">
              {line}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * What can be done with this quote right now.
 *
 * Three controls and each has one condition. **Choose** appears only on a
 * `SUBMITTED` quote — the state machine's only selectable status — and the
 * caller withholds `onSelect` entirely once anything is selected, so a second
 * selection cannot be started from a stale render.
 *
 * **Ask for a fresh price** is the whole of `M2-FE-413`: it reuses the unlock or
 * plan already paid for and charges nothing, and the copy says so because a
 * Customer who suspects a second charge simply will not press it. Once asked, it
 * becomes a statement rather than a button — only a vendor can state a price, so
 * pressing again would achieve nothing.
 */
function QuoteActions({
  card,
  onSelect,
  isSelecting,
  onReject,
  onRevalidate,
  isRevalidating,
}: {
  card: QuoteCardView;
  onSelect?: (proposalId: string) => void;
  isSelecting: boolean;
  onReject?: (proposalId: string) => void;
  onRevalidate?: (proposalId: string) => void;
  isRevalidating: boolean;
}) {
  if (card.isExpired) {
    return (
      <div className="mt-5 border-t border-line pt-4">
        <p className="max-w-prose text-sm leading-6 text-text-secondary">
          This price has run out. You can ask the professional to confirm it
          again — <strong className="font-semibold text-text">that costs nothing</strong> and
          uses what you have already paid on this request.
        </p>
        {card.hasAskedForRevalidation ? (
          <p className="mt-2 text-sm text-text" role="status">
            We have asked them. They answer by sending a fresh price, which
            appears here.
          </p>
        ) : onRevalidate !== undefined ? (
          <div className="mt-3">
            <Button
              variant="outline"
              onClick={() => onRevalidate(card.proposalId)}
              loading={isRevalidating}
              loadingLabel="Asking them"
            >
              Ask for a fresh price — free
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  if (!card.isSelectable) {
    return (
      <div className="mt-5 border-t border-line pt-4">
        <p className="max-w-prose text-sm leading-6 text-text-secondary">
          This one can no longer be chosen. It stays here so you can see what was
          offered and when.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
      {onSelect !== undefined ? (
        <Button
          onClick={() => onSelect(card.proposalId)}
          loading={isSelecting}
          loadingLabel="Choosing"
        >
          Choose this one
        </Button>
      ) : null}
      {onReject !== undefined ? (
        <Button variant="ghost" onClick={() => onReject(card.proposalId)}>
          Not this one
        </Button>
      ) : null}
    </div>
  );
}
