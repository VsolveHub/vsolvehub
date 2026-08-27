"use client";

import type { Schemas } from "@vsolve/api-client";
import { describeError } from "@vsolve/query";
import { Button, Card, ErrorState, cn, formatMoney } from "@vsolve/ui";
import { useMemo, useState } from "react";

import { asyncStateFrom, AsyncSection } from "@/components/async-section";
import { Pictogram } from "@/components/pictogram";

import { usePriceBook, useSetPriceBookRate } from "../queries";

/**
 * "My Rate Card" — the Partner's own price book (contract 1.46.0).
 *
 * Reached from `/me/rate-card`. Lists the ops-curated catalog for this
 * Partner's skills, grouped by skill, each item showing the allowed range
 * plainly ("₹120 – ₹195") and an editable rate. There is no free-text field
 * anywhere on this screen: every item name comes from the server, and the
 * only thing a Partner can type is a number the server re-validates against
 * the band on save.
 *
 * A Partner with no catalog items for their skills yet, or serving no active
 * area, sees an honest empty state rather than a blank screen — the platform
 * has not curated this trade's catalog, which is a fact worth saying rather
 * than hiding.
 */
export function PriceBookScreen() {
  const priceBook = usePriceBook();
  const state = asyncStateFrom(priceBook, (data) => data.items);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6">
      <h1 className="text-headline text-text">Your rate card</h1>
      <p className="mt-1 text-body text-text-secondary">
        Set your own rate for each item. Every rate must sit inside the range
        we show — it keeps every quote comparable and protects your
        customer&rsquo;s trust in the price.
      </p>

      <div className="mt-5">
        <AsyncSection
          state={state}
          label="Loading your rate card"
          onRetry={() => void priceBook.refetch()}
          isEmpty={(items) => items.length === 0}
          empty={
            <Card className="mt-2 flex flex-col items-center gap-2 py-10 text-center">
              <Pictogram name="price" size="lg" className="text-text-muted" />
              <p className="text-base font-semibold text-text">No items to price yet</p>
              <p className="max-w-[32ch] text-sm text-text-secondary">
                We have not published a work-item catalog for your trade in your
                area yet. Nothing you quote is affected.
              </p>
            </Card>
          }
        >
          {(items) => <PriceBookList items={items} />}
        </AsyncSection>
      </div>
    </main>
  );
}

type PriceBookItem = Schemas["PriceBookEntry"];

function PriceBookList({ items }: { items: PriceBookItem[] }) {
  const groups = useMemo(() => groupBySkill(items), [items]);

  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <section key={group.skillId} aria-label={group.skillId}>
          <ul className="flex flex-col gap-2.5">
            {group.items.map((item) => (
              <li key={item.work_item.id}>
                <PriceBookRow item={item} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function groupBySkill(items: PriceBookItem[]): { skillId: string; items: PriceBookItem[] }[] {
  const bySkill = new Map<string, PriceBookItem[]>();
  for (const item of items) {
    const bucket = bySkill.get(item.work_item.skill) ?? [];
    bucket.push(item);
    bySkill.set(item.work_item.skill, bucket);
  }
  return [...bySkill.entries()].map(([skillId, groupItems]) => ({ skillId, items: groupItems }));
}

function PriceBookRow({ item }: { item: PriceBookItem }) {
  const setRate = useSetPriceBookRate();
  const [rupees, setRupees] = useState<string>(
    item.partner_rate_paise === null ? "" : String(item.partner_rate_paise / 100),
  );
  const [isActive, setIsActive] = useState(item.partner_is_active);

  const hasBand = item.floor_paise !== null && item.ceiling_paise !== null;
  const parsedRupees = Number.parseFloat(rupees);
  const canSave =
    hasBand && rupees.trim() !== "" && Number.isFinite(parsedRupees) && parsedRupees > 0;
  const isDirty =
    canSave &&
    (Math.round(parsedRupees * 100) !== (item.partner_rate_paise ?? -1) ||
      isActive !== item.partner_is_active);

  function save() {
    if (!canSave) return;
    setRate.mutate({
      workItemId: item.work_item.id,
      ratePaise: Math.round(parsedRupees * 100),
      isActive,
    });
  }

  const errorMessage = setRate.isError
    ? describeError(setRate.error, "mutation").message
    : null;

  return (
    <Card
      padding="md"
      className={cn(
        "flex flex-col gap-2.5",
        isActive ? "" : "opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-text">{item.work_item.name}</p>
          <p className="text-xs text-text-secondary">Per {unitLabel(item.work_item.unit)}</p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={isActive}
          aria-label={isActive ? "Active — tap to deactivate" : "Inactive — tap to activate"}
          onClick={() => setIsActive((current) => !current)}
          className={cn(
            "relative h-7 w-12 shrink-0 rounded-full transition-colors duration-fast",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
            isActive ? "bg-action" : "bg-surface-sunken",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 h-6 w-6 rounded-full bg-surface shadow-card transition-transform duration-fast",
              isActive ? "translate-x-5" : "translate-x-0.5",
            )}
          />
        </button>
      </div>

      {hasBand ? (
        <p className="text-xs text-text-secondary">
          Allowed range: {formatMoney(item.floor_paise as number)} –{" "}
          {formatMoney(item.ceiling_paise as number)}
        </p>
      ) : (
        <p className="text-xs text-warning-text">
          Not priced in your area yet — you cannot set a rate for this item here.
        </p>
      )}

      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-text-secondary" aria-hidden>
          ₹
        </span>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step={1}
          disabled={!hasBand}
          value={rupees}
          onChange={(event) => setRupees(event.target.value)}
          aria-label={`Your rate for ${item.work_item.name}`}
          className={cn(
            "h-11 flex-1 rounded-control border border-line bg-surface px-3 text-base font-semibold text-text",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
            "disabled:opacity-50",
          )}
        />
        <Button
          size="sm"
          disabled={!isDirty}
          loading={setRate.isPending}
          loadingLabel="Saving"
          onClick={save}
        >
          Save
        </Button>
      </div>

      {errorMessage ? (
        <ErrorState inline severity="error" title="Could not save this rate" message={errorMessage} />
      ) : null}
    </Card>
  );
}

const UNIT_LABELS: Record<string, string> = {
  each: "item",
  job: "job",
  hour: "hour",
  day: "day",
  sq_ft: "sq.ft",
  running_ft: "running ft",
  metre: "metre",
  kg: "kg",
  litre: "litre",
  set: "set",
};

function unitLabel(unit: string): string {
  return UNIT_LABELS[unit] ?? unit;
}
