import { Button, FactTile } from "@vsolve/ui";

import { Pictogram } from "@/components/pictogram";

import {
  BackGlyph,
  FocusedHeader,
  HeaderTile,
} from "@/features/proposal/view/parts/focused-header";

/**
 * The gap between accepting a visit and being able to travel to it.
 *
 * ## Why this state has a screen at all
 *
 * Accepting does not book. BE-4 holds the slot while the customer pays, and
 * only a verified payment turns a hold into a booking — so there is a window,
 * minutes long, where the partner has won the visit and must not set off. A
 * partner who drives across the city on a hold that then expires has lost an
 * afternoon to a state nobody drew.
 *
 * So the warning is the loudest thing here, above the facts and before the
 * money. "Do not travel yet" is the whole message; everything else on the
 * screen is context for it.
 *
 * ## The locked rows are the point, not decoration
 *
 * The exact address and the customer's phone number both exist on the server
 * right now, and both are deliberately withheld until payment confirms — that
 * is BE-3's rule about not exposing an address before the visit is paid for.
 * Rendering them as locked rows rather than hiding them says two true things at
 * once: there is an address, and you cannot have it yet. Hiding the rows
 * entirely would let a partner conclude the customer never supplied one.
 *
 * `FactTile`'s `locked` variant carries that: a dashed edge and a sunken plate,
 * so the state reads without relying on colour (plan 03).
 *
 * ## Pure and unwired
 *
 * BE-3 is unpublished, so this renders from props at `/design/m2/held` and
 * fetches nothing. Releasing a held visit is a real mutation that does not
 * exist yet; the control is present and inert, and the route that mounts this
 * for real supplies the handler.
 */

export interface HeldVisitScreenProps {
  /** The service as the enquiry names it. */
  serviceName: string;
  /** Day the customer chose. Never editable by the partner — that is the point. */
  dateLabel: string;
  /** Start time, e.g. "10:00". */
  startsLabel: string;
  /**
   * Locality only. The street address exists but is withheld until payment, and
   * this string is what the partner is allowed to see in the meantime.
   */
  approximateAreaLabel: string;
  /** What the partner receives once the visit is completed. */
  earningLabel: string;
  /** How long V Solve Hub expects the payment to take, in words. */
  confirmWindowLabel: string;
}

export function HeldVisitScreen({
  serviceName,
  dateLabel,
  startsLabel,
  approximateAreaLabel,
  earningLabel,
  confirmWindowLabel,
}: HeldVisitScreenProps) {
  return (
    <div className="flex h-full flex-col bg-canvas">
      <FocusedHeader
        eyebrow="Site visit"
        title={serviceName}
        backSlot={
          <HeaderTile>
            <BackGlyph label="Back to your work" />
          </HeaderTile>
        }
        trailing={
          <span className="shrink-0 rounded-full border border-surface/25 bg-surface/12 px-3 py-1 text-xs font-bold uppercase tracking-[0.05em] text-surface">
            Held
          </span>
        }
      />

      <main className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-4 pb-4 pt-4">
        {/* Won, and said plainly — a partner who is not sure they got it will
            call support, which costs more than a sentence. */}
        <div className="flex flex-col items-center gap-2.5">
          <span
            aria-hidden
            className="grid size-16 place-items-center rounded-full bg-success-surface text-success-text"
          >
            <Pictogram name="yes" size="lg" />
          </span>
          <p className="text-xl font-extrabold tracking-[-0.02em] text-text">This visit is yours</p>
          <p className="text-[13px] text-text-secondary">
            You were first to accept. No one else can take it.
          </p>
        </div>

        {/* The one thing on this screen that must not be missed. */}
        <div className="flex gap-3 rounded-card border-[1.5px] border-warning-line bg-warning-surface p-3.5">
          <span aria-hidden className="mt-px shrink-0 text-warning-text">
            <Pictogram name="later" size="md" />
          </span>
          <div className="min-w-0">
            <p className="text-[15px] font-extrabold tracking-[-0.015em] text-warning-text">
              Do not travel yet
            </p>
            <p className="mt-1.5 text-[12.5px] leading-[18px] text-warning-text">
              The customer is paying now. We will confirm and unlock the address within{" "}
              {confirmWindowLabel}.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <FactTile icon={<Pictogram name="time" size="sm" />} label="Date" value={dateLabel} />
          <FactTile icon={<Pictogram name="now" size="sm" />} label="Starts" value={startsLabel} />
        </div>

        {/* Present but withheld. Hiding these would read as "no address given". */}
        <div className="flex flex-col gap-2">
          <FactTile
            locked
            icon={<Pictogram name="site" size="sm" />}
            label="Exact address"
            value={`${approximateAreaLabel} — unlocks after payment`}
          />
          <FactTile
            locked
            icon={<Pictogram name="call" size="sm" />}
            label="Customer phone"
            value="Unlocks after payment"
          />
        </div>
      </main>

      <div className="flex shrink-0 flex-col gap-2.5 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <p className="text-center text-xs text-text-muted">
          You receive <span className="font-extrabold text-text">{earningLabel}</span> after you
          complete this visit.
        </p>
        <Button variant="outline" block size="lg">
          Release this visit
        </Button>
      </div>
    </div>
  );
}
