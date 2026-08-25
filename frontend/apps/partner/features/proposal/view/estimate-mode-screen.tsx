import type { ReactNode } from "react";

import { Button, Card, StepDock, cn } from "@vsolve/ui";

import { Pictogram, type PictogramName } from "@/components/pictogram";

import type { EstimateMode, EstimateView } from "../model/estimate-view";
import { BackGlyph, FocusedHeader, HeaderTile } from "./parts/focused-header";

/**
 * The first screen of the M2 estimate: who this is for, and which of the two
 * line families it will be built from.
 *
 * ## Why a whole screen for one choice
 *
 * `EstimateMode` is not a toggle the partner can flip halfway through. An
 * item-wise estimate and a labour-wise one carry different line shapes — Nos ×
 * rate against crew × days × rate — so switching after rows exist means
 * discarding them. Asking once, before anything has been typed, is the only
 * point at which the answer is free. That is what the caution line under the
 * cards is doing, and why it is a caution rather than a hint.
 *
 * The identity cards above the choice are not decoration either. A partner
 * opens this from an offer inbox that may hold several live jobs; the estimate
 * they are about to spend ten minutes on has to name the customer and the date
 * before it asks for anything. Getting that wrong is not a bad estimate, it is
 * an estimate sent to the wrong person.
 *
 * ## Presentational
 *
 * Props in, JSX out. It fetches nothing, holds no state and formats no money —
 * every string on it arrives pre-formatted on `EstimateView`, because a screen
 * that reformats a server figure is a screen that will one day disagree with
 * the server. The mode cards are therefore a rendering of `selectedMode`, not a
 * control that changes it: the owning route holds that state and re-renders
 * this with a new prop.
 *
 * ## What the artboard shows that the view type does not carry
 *
 * The design's partner strip reads "4.8 ★ (256) · 12+ years · Hyderabad".
 * `EstimateView.partner` carries `rating` and nothing else, so only the rating
 * is drawn. The review count, tenure and city are deliberately not invented
 * here — a partner profile line that renders plausible numbers nobody supplied
 * is worse than a shorter true one.
 */

export interface EstimateModeScreenProps {
  estimate: EstimateView;
  /** Which family the estimate will be built from. Owned by the route above. */
  selectedMode: EstimateMode;
}

export function EstimateModeScreen({ estimate, selectedMode }: EstimateModeScreenProps) {
  const { partner, customer } = estimate;
  const itemWise = selectedMode === "ITEM_WISE";

  return (
    <div className="flex h-full flex-col bg-canvas">
      <FocusedHeader
        title={estimate.documentTitle}
        backSlot={
          <HeaderTile>
            <BackGlyph label="Back" />
          </HeaderTile>
        }
        trailing={
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-surface/12 px-2.5 py-1.5 text-[11px] font-bold text-success-line">
            <Pictogram name="yes" size="xs" />
            Draft saved
          </span>
        }
      />

      <main className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pt-4">
        {/* Who is quoting. Verified is a server fact, never a local assumption. */}
        <Card padding="sm" className="flex items-center gap-3">
          <span
            aria-hidden
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-action-secondary text-[15px] font-extrabold text-surface"
          >
            {partner.initials}
          </span>

          <span className="flex min-w-0 flex-1 flex-col">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-[15px] font-extrabold tracking-[-0.02em] text-text">
                {partner.name}
              </span>
              {partner.verified ? (
                <span className="shrink-0 text-info-text">
                  <Pictogram name="warranty" size="sm" />
                  <span className="sr-only">Verified partner</span>
                </span>
              ) : null}
            </span>

            <span className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-text-muted">
              <Pictogram name="rating" size="xs" className="shrink-0 text-action" />
              <span className="sr-only">Rating</span>
              {partner.rating}
            </span>
          </span>
        </Card>

        {/* Who it is for. Named before anything is priced, on purpose. */}
        <Card padding="sm">
          <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-text-muted">
            Estimate for
          </p>

          <div className="mt-1.5 flex items-center gap-2.5">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-base font-bold tracking-[-0.015em] text-text">
                {customer.name}
              </span>
              <span className="mt-0.5 truncate text-[12.5px] font-medium text-text-secondary">
                {customer.locality}
              </span>
            </span>

            <a
              href={`tel:${customer.phone.replace(/\s/g, "")}`}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-selected-surface text-text-link"
            >
              <Pictogram name="call" size="md" />
              <span className="sr-only">Call {customer.name}</span>
            </a>
          </div>

          <div className="mt-3 flex items-center gap-2 border-t border-line pt-3 text-[12.5px] font-medium text-text-muted">
            <Pictogram name="date" size="sm" className="shrink-0" />
            <span>
              Estimate date{" "}
              <strong className="font-bold text-text">{estimate.estimateDate}</strong>
            </span>
          </div>
        </Card>

        {/* Exactly one family per estimate — no mixed mode. */}
        <div className="mt-0.5 flex flex-col gap-3">
          <ModeCard
            selected={itemWise}
            icon="papers"
            title="Item wise estimate"
            description="Add items and set labour charges"
          />

          <div className="flex items-center justify-center gap-2.5">
            <span aria-hidden className="h-px flex-1 bg-line" />
            <span
              aria-hidden
              className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full bg-surface-sunken text-[11px] font-extrabold tracking-[0.06em] text-text-muted"
            >
              OR
            </span>
            <span aria-hidden className="h-px flex-1 bg-line" />
          </div>

          <ModeCard
            selected={!itemWise}
            icon="crew"
            title="Labour wise estimate"
            description="Add teams and working days"
          />
        </div>

        <p className="mt-0.5 flex gap-2 pb-4 text-xs font-medium leading-[17px] text-text-muted">
          <span aria-hidden className="mt-px shrink-0 text-warning-text">
            <Pictogram name="later" size="sm" />
          </span>
          <span>Pick one. Switching later clears the rows you have already entered.</span>
        </p>
      </main>

      <StepDock>
        <Button size="lg" block>
          {itemWise ? "Start the item list" : "Start the labour list"}
        </Button>
      </StepDock>
    </div>
  );
}

/**
 * One of the two families, drawn as a card rather than a radio.
 *
 * A tinted plate with a thickened navy edge and a tick says "this one" at
 * arm's length in a way a 20px radio dot does not, and the choice is the only
 * thing on the screen — there is nothing for it to be confused with. The
 * selected card loses a pixel of padding to the extra border pixel so choosing
 * the other family does not resize the stack.
 *
 * Local to this screen on purpose. It is a layout of two cards, not a
 * primitive: the moment a second screen needs it, it moves to @vsolve/ui with
 * a contrast test, rather than being copied.
 */
function ModeCard({
  selected,
  icon,
  title,
  description,
}: {
  selected: boolean;
  icon: PictogramName;
  title: string;
  description: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-card",
        selected
          ? "border-2 border-navy-700 bg-selected-surface px-[13px] py-[15px]"
          : "border border-line bg-surface px-3.5 py-4",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "grid h-11 w-11 shrink-0 place-items-center rounded-card",
          selected ? "bg-action-secondary text-surface" : "bg-surface-sunken text-text-secondary",
        )}
      >
        <Pictogram name={icon} size="md" />
      </span>

      <span className="flex min-w-0 flex-1 flex-col">
        <span
          className={cn(
            "text-[15px] tracking-[-0.015em]",
            selected ? "font-extrabold text-text-link" : "font-bold text-text",
          )}
        >
          {title}
        </span>
        <span
          className={cn(
            "mt-0.5 text-xs font-medium",
            selected ? "text-text-secondary" : "text-text-muted",
          )}
        >
          {description}
        </span>
      </span>

      {selected ? (
        <span className="shrink-0 text-text-link">
          <Pictogram name="yes" size="md" />
          <span className="sr-only">Selected</span>
        </span>
      ) : null}
    </div>
  );
}
