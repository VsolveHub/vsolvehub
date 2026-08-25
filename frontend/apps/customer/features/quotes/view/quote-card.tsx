"use client";

import { Badge, Button, Disclosure, cn } from "@vsolve/ui";

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

  /**
   * Marks this card as the one the Customer is leaning towards.
   *
   * Picking is **not** choosing. It sets no server state and costs nothing; the
   * commitment is made once, in the docked bar, where the consequence — that
   * this is not a booking until the professional confirms — is stated next to
   * the button that does it. Withheld entirely once a real selection exists, so
   * a stale render cannot start a second one.
   */
  onPick?: (proposalId: string) => void;
  isPicked: boolean;
  /** The server-persisted choice, distinct from a local pre-selection. */
  isChosen?: boolean;

  onReject?: (proposalId: string) => void;
  /** `M2-FE-413` — offered only on an expired quote, and it charges nothing. */
  onRevalidate?: (proposalId: string) => void;
  isRevalidating: boolean;
}

export function QuoteCard({
  card,
  index,
  onPick,
  isPicked,
  isChosen = false,
  onReject,
  onRevalidate,
  isRevalidating,
}: QuoteCardProps) {
  const headingId = `quote-${card.proposalId}`;
  const pickable = onPick !== undefined && card.isSelectable && !card.isExpired;

  return (
    <article
      // The comparison table's "Read it" links here. `scroll-mt` keeps the
      // heading clear of the sticky page chrome when it does.
      id={`estimate-${card.proposalId}`}
      aria-labelledby={headingId}
      className={cn(
        "scroll-mt-6 overflow-hidden rounded-card bg-surface",
        isPicked || isChosen
          ? "shadow-raised ring-2 ring-selected"
          : "border border-line shadow-card",
      )}
    >
      {/* ## Why the whole card is one label
       *
       * Choosing between quotes is a radio-group decision, and the target for
       * it was a `Choose this one` button at the bottom of a card that is
       * frequently a full screen tall — so picking meant scrolling past the
       * thing you were judging to reach the control. Wrapping the summary in a
       * `<label>` over a real radio makes the price, the name and the badges —
       * everything you actually decide on — the tap target, and costs nothing
       * semantically: it is still a radio group, still keyboard-navigable with
       * arrows, still announced as "1 of 3".
       *
       * The secondary controls live **below** this label, not inside it. A
       * button nested in a label is activated by the label's own click handler
       * as well as its own, which is how "Not this one" would quietly select
       * the quote it was rejecting.
       */}
      <label
        className={cn(
          "block p-4",
          pickable ? "cursor-pointer" : null,
          isPicked || isChosen ? "bg-selected-surface" : null,
        )}
      >
        <input
          type="radio"
          // One group per screen: choosing is choosing *between* these.
          name="quote-choice"
          value={card.proposalId}
          checked={isPicked}
          disabled={!pickable}
          onChange={() => onPick?.(card.proposalId)}
          className="sr-only"
        />
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
          {isChosen ? <Badge tone="success">Chosen</Badge> : null}
          {card.isOutOfBudget ? <Badge tone="warning">Over budget</Badge> : null}
          {card.isExpired ? <Badge tone="neutral">Price expired</Badge> : null}
          {pickable ? (
            // The radio itself is `sr-only`, so this is its visible face. Shape
            // and fill, never colour alone.
            <span
              aria-hidden
              className={cn(
                "mt-1 flex size-6 items-center justify-center rounded-full",
                isPicked ? "bg-selected" : "ring-2 ring-inset ring-warm-300",
              )}
            >
              {isPicked ? (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={3.2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-3 text-text-inverse"
                >
                  <path d="m5 12 5 5 9-10" />
                </svg>
              ) : null}
            </span>
          ) : null}
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
      </label>

      {/* Everything the vendor wrote, one tap away.
       *
       * Not one line of it is cut — the staging, the inclusions, the
       * exclusions and the warranty are the whole reason an unlocked quote is
       * worth what it cost, and `M2-FE-423` forbids gating any of it. What
       * changes is that three quotes no longer arrive as three screens of
       * prose stacked end to end, with the price of the second one somewhere
       * below the exclusions of the first. Open is a choice per quote, and the
       * decision the screen is for — which price, from whom — is legible
       * without making it. */}
      <div className="border-t border-line px-4 pb-4 pt-3">
        <Disclosure
          summary="Read the full scope"
          hint={card.exclusions.length > 0 ? "Includes exclusions" : undefined}
        >
          <div className="text-text">
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

      {/* Materials the vendor priced in. These amounts are already inside the
          headline total, so leaving them out — which this card did until now —
          meant the Customer was reading a number that included goods the app
          never named. Shown beside the stages rather than folded into them,
          because a material is not a milestone. */}
      {card.materials.length > 0 ? (
        <section className="mt-4">
          <h4 className="text-sm font-semibold text-text">Materials they will supply</h4>
          <ul className="mt-2 flex list-none flex-col gap-2 p-0">
            {card.materials.map((material, materialIndex) => (
              <li
                key={`${card.proposalId}-material-${materialIndex}`}
                className="flex items-start justify-between gap-3 rounded-card border border-line p-3"
              >
                <div className="min-w-0">
                  <p className="font-medium text-text">{material.title}</p>
                  {material.quantityLabel !== null ? (
                    <p className="mt-0.5 text-sm text-text-secondary">
                      {material.quantityLabel}
                    </p>
                  ) : null}
                </div>
                <p className="shrink-0 font-medium text-text">{material.amountLabel}</p>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-text-secondary">
            Already counted in the total above.
          </p>
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

          </div>
        </Disclosure>
      </div>

      <QuoteActions
        card={card}
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
 * Choosing is **not** here any more. It happens once, in the screen's docked
 * bar, beside the sentence saying what choosing does and does not mean — a
 * control repeated on every card is a commitment a Customer can make three
 * times before reading the consequence once. What is left are the two actions
 * that belong to one quote and only one: turning it down, and asking an expired
 * price to be confirmed.
 *
 * **Ask for a fresh price** is the whole of `M2-FE-413`: it reuses the unlock or
 * plan already paid for and charges nothing, and the copy says so because a
 * Customer who suspects a second charge simply will not press it. Once asked, it
 * becomes a statement rather than a button — only a vendor can state a price, so
 * pressing again would achieve nothing.
 */
function QuoteActions({
  card,
  onReject,
  onRevalidate,
  isRevalidating,
}: {
  card: QuoteCardView;
  onReject?: (proposalId: string) => void;
  onRevalidate?: (proposalId: string) => void;
  isRevalidating: boolean;
}) {
  if (card.isExpired) {
    return (
      <div className="border-t border-line p-4">
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
      <div className="border-t border-line p-4">
        <p className="max-w-prose text-sm leading-6 text-text-secondary">
          This one can no longer be chosen. It stays here so you can see what was
          offered and when.
        </p>
      </div>
    );
  }

  if (onReject === undefined) return null;

  return (
    <div className="flex flex-wrap gap-2 border-t border-line p-4 pt-3">
      <Button variant="ghost" onClick={() => onReject(card.proposalId)}>
        Not this one
      </Button>
    </div>
  );
}
