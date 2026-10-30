"use client";

import type { ReactNode } from "react";

import { Badge, Button, Input, StepDock, cn, useT } from "@vsolve/ui";

import { Pictogram } from "@/components/pictogram";
import type { EstimateLineView, EstimateView } from "@/features/proposal/model/estimate-view";
import {
  BackGlyph,
  FocusedHeader,
  HeaderTile,
} from "@/features/proposal/view/parts/focused-header";
import { LedgerRow } from "@/features/proposal/view/parts/ledger-row";

/**
 * The other way to price a job: not what gets fitted, but who turns up and for
 * how long.
 *
 * A demolition, a deep clean, a shifting job or a site with twenty points has no
 * useful item list — the customer is buying five electricians for five days, and
 * an item-wise ledger of it would be an invented breakdown nobody can check. So
 * a labour-wise estimate is rows of *role × members × days × day rate*, and the
 * arithmetic is visible on the row rather than hidden behind a total.
 *
 * ## Exclusive with the item list, and the screen says so
 *
 * `EstimateMode` allows exactly one family per estimate. The line under the add
 * row states it plainly and once — "priced by team and days only" — because the
 * failure it prevents is silent: a partner who assumes rows carry over from the
 * item list sends an estimate missing everything they typed there. `EstimateView`
 * makes the same guarantee numerically, in that `totals.linesTotal` is the sum of
 * the *selected* mode's lines and the other mode contributes nothing.
 *
 * ## Open in place
 *
 * One role carries its controls (`openLineId`); the rest stay ledger lines with
 * their working and amount. Two open rows on a 390px screen means neither the
 * list nor the editor fits, and a partner who cannot see the other roles cannot
 * tell whether the crew adds up.
 *
 * ## Pure, and unwired on purpose
 *
 * Props in, JSX out. It fetches nothing, holds no state and does no arithmetic —
 * the amount on each row and the labour total in the dock arrive pre-formatted,
 * because a screen that multiplies members by days by rate is a screen that will
 * one day disagree with the invoice. The fields carry `defaultValue` rather than
 * `value`; the handlers arrive with the composer that mounts this.
 *
 * ## Where the open row's values come from
 *
 * Off `EstimateLineView` directly: `quantity` is the days, `rate` the day rate,
 * and `members` the headcount. Contract 1.43.0 cannot express any of this — A3
 * labour is three flat integers on the proposal root rather than an array of
 * roles, so "two masons for five days plus three helpers for five days"
 * collapses to one blended day rate. Proposal 0015 asks for the array; until it
 * publishes, the adapter is what is missing, not these fields.
 */

export interface LabourWiseScreenProps {
  estimate: EstimateView;
  /** The single role rendered open. Everything else stays collapsed. */
  openLineId?: string;
}

interface CrewWorking {
  members: string;
  days: string;
  /** Digits and grouping only — the rupee sign is drawn by the field, not stored. */
  rate: string;
}

/**
 * The three dimensions a labour line prices, read off the view rather than out
 * of its rendered working.
 *
 * A labour line is people × days × rate/day. `quantity` carries the days and
 * `rate` the day rate — the two dimensions it shares with an item line — and
 * `members` carries the third. An earlier revision recovered all three with a
 * regex over "10 × 5 × ₹300"; a display string is the worst available source of
 * truth for a form, and it breaks the day somebody types `x` for `×`.
 */
function crewFields(line: EstimateLineView): CrewWorking {
  return {
    members: line.members ?? "1",
    days: line.quantity,
    // The field draws its own rupee prefix, so the value carries digits only.
    rate: line.rate.replace(/^\s*₹\s*/u, ""),
  };
}

export function LabourWiseScreen({ estimate, openLineId }: LabourWiseScreenProps) {
  // Sections exist on the view type for the item-wise grouping; a labour estimate
  // is one flat list of roles, so they are flattened rather than banded.
  const roles = estimate.sections.flatMap((section) => section.lines);
  const t = useT();

  return (
    <div className="flex h-full flex-col bg-canvas">
      <FocusedHeader
        title={estimate.documentTitle}
        backSlot={
          <HeaderTile>
            <BackGlyph label={t("proposal.screens.shared.backToEstimate")} />
          </HeaderTile>
        }
      />

      <main className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4 pt-4">
        <div className="flex items-start gap-2.5">
          <div className="min-w-0 flex-1">
            <h2 className="text-xs font-extrabold uppercase tracking-[0.06em] text-text-link">
              {t("proposal.screens.mode.labourWise.title")}
            </h2>
            <p className="mt-[3px] text-[11.5px] font-medium leading-4 text-text-muted">
              {t("proposal.screens.labour.subheading")}
            </p>
          </div>

          <Badge tone="info" className="h-9 shrink-0 px-3 font-bold">
            {t("proposal.screens.labour.roles", { count: roles.length })}
          </Badge>
        </div>

        {roles.map((line) => (
          <RoleRow key={line.id} line={line} open={line.id === openLineId} />
        ))}

        <AddRoleControl />

        {/* The exclusivity rule, said once and plainly. */}
        <p className="flex gap-2 text-xs font-medium leading-[17px] text-text-muted">
          <span aria-hidden className="mt-px shrink-0 text-warning-text">
            <Pictogram name="later" size="sm" />
          </span>
          <span>{t("proposal.screens.labour.note")}</span>
        </p>
      </main>

      <StepDock label={t("proposal.screens.labour.total")} amount={estimate.totals.linesTotal}>
        <Button block size="lg">
          {t("proposal.screens.shared.continueToCharges")}
        </Button>
      </StepDock>
    </div>
  );
}

/**
 * One role as a ledger line.
 *
 * Collapsed, the qualifier joins the working on the meta line — "Skilled ·
 * 5 × 5 × ₹600" — because a row that says only "Electrician ₹15,000" hides the
 * crew size, which is the number a customer queries. Open, the qualifier moves
 * back under the name where the controls can have the meta line's space.
 */
function RoleRow({ line, open }: { line: EstimateLineView; open: boolean }) {
  return (
    <LedgerRow
      name={line.name}
      amount={line.amount}
      meta={
        line.qualifier === undefined ? line.workings : `${line.qualifier} · ${line.workings}`
      }
      open={open}
      removeSlot={open ? <RemoveRoleControl name={line.name} /> : undefined}
    >
      <OpenRoleFields line={line} />
    </LedgerRow>
  );
}

/**
 * What an open role grows: the three numbers that make the amount.
 *
 * Members and Days sit side by side because they are one thought — the size of
 * the crew and how long it stays — and separating them onto two rows pushes the
 * rate below the fold on a 390px phone. That is why the steppers here are local
 * markup rather than `QuantityStepper`: the kit's stepper renders its label
 * *beside* its controls, which needs about 214px, and half of an open row is
 * 161px. The chrome, the 44x44 targets and the group/label wiring are copied from
 * it exactly, so the two read as the same control.
 *
 * The working is repeated beside the rate rather than only in the amount, so the
 * partner can see the multiplication they are about to change.
 */
function OpenRoleFields({ line }: { line: EstimateLineView }) {
  const crew = crewFields(line);
  const t = useT();

  return (
    <>
      {line.qualifier === undefined ? null : (
        <span className="mt-0.5 block text-[11px] font-medium text-text-muted">
          {line.qualifier}
        </span>
      )}

      <div className="mt-2.5 flex flex-col gap-2.5">
        <div className="flex gap-2.5">
          <CountStepper
            label={t("proposal.screens.labour.members")}
            value={crew.members}
            decrementLabel={t("proposal.screens.shared.oneLess", { name: line.name })}
            incrementLabel={t("proposal.screens.shared.oneMore", { name: line.name })}
          />
          <CountStepper
            label={t("proposal.screens.labour.days")}
            value={crew.days}
            decrementLabel={t("proposal.screens.labour.dayLess", { name: line.name })}
            incrementLabel={t("proposal.screens.labour.dayMore", { name: line.name })}
          />
        </div>

        <div>
          <MiniLabel>{t("proposal.screens.labour.ratePerDay")}</MiniLabel>

          <div className="flex items-center gap-2.5">
            <span className="relative w-28 shrink-0">
              <span
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[15px] font-semibold text-text-muted"
              >
                ₹
              </span>
              <Input
                aria-label={t("proposal.screens.labour.rateFor", { name: line.name })}
                inputMode="numeric"
                defaultValue={crew.rate}
                placeholder="0"
                className="pl-7 font-bold tabular-nums"
              />
            </span>

            <span className="min-w-0 truncate text-[12.5px] font-semibold text-text-muted">
              {line.workings}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * 44x44 square, per the touch-target rule. Deliberately not `Button`, for the
 * reason `QuantityStepper` gives: `Button`'s `md` is a pill padded for a word,
 * and a square glyph target is a different control.
 */
const STEP_CONTROL = cn(
  "grid h-11 w-11 shrink-0 place-items-center rounded-control",
  "border border-line-strong bg-surface text-lg leading-none text-text",
  "transition-colors duration-fast ease-out hover:bg-surface-hover active:bg-surface-sunken",
);

/**
 * Local to this screen on purpose.
 *
 * It is `QuantityStepper` in the one layout the kit's version cannot take — label
 * above, controls filling the column — not a second stepper. If a second screen
 * ever needs this arrangement it moves into @vsolve/ui as a prop on the existing
 * component, rather than being copied a third time.
 */
function CountStepper({
  label,
  value,
  decrementLabel,
  incrementLabel,
}: {
  label: string;
  value: string;
  decrementLabel: string;
  incrementLabel: string;
}) {
  return (
    <div className="min-w-0 flex-1">
      <MiniLabel>{label}</MiniLabel>

      <div role="group" aria-label={label} className="flex items-center">
        <button type="button" className={STEP_CONTROL} aria-label={decrementLabel}>
          <span aria-hidden>−</span>
        </button>

        <output className="grid h-11 min-w-0 flex-1 place-items-center text-base font-extrabold tabular-nums text-text">
          {value}
        </output>

        <button type="button" className={STEP_CONTROL} aria-label={incrementLabel}>
          <span aria-hidden>+</span>
        </button>
      </div>
    </div>
  );
}

/** 44x44, per the touch-target rule, even though the glyph inside it is 16px. */
function RemoveRoleControl({ name }: { name: string }) {
  const t = useT();
  return (
    <button
      type="button"
      className={cn(
        "grid h-11 w-11 shrink-0 place-items-center rounded-control text-danger-text",
        "transition-colors duration-fast ease-out hover:bg-danger-surface",
      )}
    >
      <Pictogram name="no" size="sm" />
      <span className="sr-only">{t("proposal.screens.shared.remove", { name })}</span>
    </button>
  );
}

/**
 * Adding a role is a dashed row rather than a header "+", so it sits at the end
 * of the roles it extends — where a partner looks after entering the last one —
 * and its dashed edge says "not a role yet" without a label explaining that. It
 * doubles as the empty state: a labour estimate with no roles is this row, the
 * heading above it and nothing else, which is the correct thing to show.
 */
function AddRoleControl() {
  const t = useT();
  return (
    <button
      type="button"
      className={cn(
        "flex h-12 w-full items-center justify-center gap-2 rounded-xl",
        "border-[1.5px] border-dashed border-line-strong",
        "text-sm font-bold text-text-secondary",
        "transition-colors duration-fast ease-out hover:bg-surface-hover",
      )}
    >
      <Pictogram name="more" size="sm" />
      {t("proposal.screens.labour.addRole")}
    </button>
  );
}

function MiniLabel({ children }: { children: ReactNode }) {
  return (
    <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.06em] text-text-muted">
      {children}
    </span>
  );
}
