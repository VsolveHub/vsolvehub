"use client";

import type { Schemas } from "@vsolve/api-client";
import { describeError } from "@vsolve/query";
import { Button, Card, ErrorState, cn, formatMoney, useT } from "@vsolve/ui";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { asyncStateFrom, AsyncSection } from "@/components/async-section";
import { Pictogram } from "@/components/pictogram";

import { usePriceBook, useSetPriceBookRate } from "../queries";

/**
 * "My Rate Card" — the Partner's own price book (contract 1.48.0).
 *
 * Reached from `/me/rate-card`. Lists the ops-curated catalogue for this
 * Partner's skills, grouped by the composer tab each item belongs to
 * (`work_item.group`: Points, Boards, MCB / DB, … with Labour last), each
 * item showing the allowed range plainly ("₹120 – ₹195") and the rate the
 * estimate composer will fill in from. There is no free-text field anywhere
 * on this screen: every item name comes from the server, and the only thing a
 * Partner can type is a number the server re-validates against the band on
 * save.
 *
 * An item still on the city reference rate says so — "City rate — tap to set
 * yours" — because that is the difference between a rate the Partner chose
 * and one the platform chose for them, and the estimate composer uses either.
 *
 * A Partner with no catalogue items for their skills yet, or serving no active
 * area, sees an honest empty state rather than a blank screen.
 */
export function PriceBookScreen() {
  const t = useT();
  const priceBook = usePriceBook();
  const state = asyncStateFrom(priceBook, (data) => data.items);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6">
      <div className="mb-2">
        <Link
          href="/me"
          className="inline-flex min-h-11 items-center gap-1.5 text-xs font-semibold text-text-secondary hover:text-navy-900 transition-colors"
        >
          <ArrowLeft size={16} aria-hidden />
          {t("money.priceBook.backToAccount")}
        </Link>
      </div>
      <h1 className="text-headline text-text">{t("money.priceBook.heading")}</h1>
      <p className="mt-1 text-body text-text-secondary">
        {t("money.priceBook.subheading")}
      </p>

      <div className="mt-5">
        <AsyncSection
          state={state}
          label={t("money.priceBook.loading")}
          onRetry={() => void priceBook.refetch()}
          isEmpty={(items) => items.length === 0}
          empty={
            <Card className="mt-2 flex flex-col items-center gap-2 py-10 text-center">
              <Pictogram name="price" size="lg" className="text-text-muted" />
              <p className="text-base font-semibold text-text">{t("money.priceBook.empty.title")}</p>
              <p className="max-w-[32ch] text-sm text-text-secondary">
                {t("money.priceBook.empty.body")}
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

const LABOUR_GROUP = "Labour";
const UNGROUPED = "Other";

function PriceBookList({ items }: { items: PriceBookItem[] }) {
  const t = useT();
  // One section per trade the Partner prices from (Electrician, Plumber, ...),
  // each with its composer tabs beneath. A single-trade Partner sees no trade
  // heading at all - the page title already names the job.
  const trades = useMemo(() => groupByTrade(items), [items]);

  return (
    <div className="flex flex-col gap-8">
      {trades.map((trade) => {
        const tradeName = trade.name === UNGROUPED ? t("money.priceBook.otherTrade") : trade.name;
        return (
          <section key={trade.code} aria-label={tradeName} className="flex flex-col gap-6">
            {trades.length > 1 ? (
              <h2 className="text-base font-extrabold leading-tight text-text">{tradeName}</h2>
            ) : null}
            {groupByComposerTab(trade.items).map((group) => {
              const groupName =
                group.name === LABOUR_GROUP
                  ? t("money.priceBook.labourGroup")
                  : group.name === UNGROUPED
                    ? t("money.priceBook.otherGroup")
                    : group.name;
              return (
                <section
                  key={`${trade.code}-${group.name}`}
                  aria-labelledby={`price-book-${trade.code}-${group.name}`}
                >
                  <h3
                    id={`price-book-${trade.code}-${group.name}`}
                    className="mb-2 text-xs font-extrabold uppercase tracking-[0.08em] text-text-muted"
                  >
                    {groupName}
                  </h3>
                  <ul className="flex flex-col gap-2.5">
                    {group.items.map((item) => (
                      <li key={item.work_item.id}>
                        <PriceBookRow item={item} />
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}

/** Grouped by trade in the server's order - the rate-card screen's top-level sections. */
export function groupByTrade(
  items: readonly PriceBookItem[],
): { code: string; name: string; items: PriceBookItem[] }[] {
  const byTrade = new Map<string, { code: string; name: string; items: PriceBookItem[] }>();
  for (const item of items) {
    const code = item.trade_code || "other";
    const bucket = byTrade.get(code) ?? { code, name: item.trade_name || UNGROUPED, items: [] };
    bucket.items.push(item);
    byTrade.set(code, bucket);
  }
  return [...byTrade.values()];
}

/**
 * Grouped by `work_item.group` in first-seen order — the server's own sort —
 * with Labour always last: it is the one group priced per day rather than per
 * point, and the composer shows it on its own step.
 */
export function groupByComposerTab(
  items: readonly PriceBookItem[],
): { name: string; items: PriceBookItem[] }[] {
  const byGroup = new Map<string, PriceBookItem[]>();
  for (const item of items) {
    const name = item.work_item.group?.trim() || (item.work_item.unit === "day" ? LABOUR_GROUP : UNGROUPED);
    const bucket = byGroup.get(name) ?? [];
    bucket.push(item);
    byGroup.set(name, bucket);
  }
  const groups = [...byGroup.entries()].map(([name, groupItems]) => ({ name, items: groupItems }));
  const labour = groups.filter((group) => group.name === LABOUR_GROUP);
  return [...groups.filter((group) => group.name !== LABOUR_GROUP), ...labour];
}

function PriceBookRow({ item }: { item: PriceBookItem }) {
  const t = useT();
  const setRate = useSetPriceBookRate();
  const [rupees, setRupees] = useState<string>(
    item.partner_rate_paise === null
      ? item.reference_rate_paise === null
        ? ""
        : String(item.reference_rate_paise / 100)
      : String(item.partner_rate_paise / 100),
  );
  const [isActive, setIsActive] = useState(item.partner_is_active);

  const hasBand = item.floor_paise !== null && item.ceiling_paise !== null;
  const parsedRupees = Number.parseFloat(rupees);
  const canSave =
    hasBand && rupees.trim() !== "" && Number.isFinite(parsedRupees) && parsedRupees > 0;
  const savedPaise = item.partner_rate_paise ?? (item.is_default_rate ? item.reference_rate_paise : null);
  const isDirty =
    canSave &&
    (Math.round(parsedRupees * 100) !== (savedPaise ?? -1) ||
      isActive !== item.partner_is_active ||
      item.is_default_rate);

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
          <p className="text-xs text-text-secondary">
            {t("money.priceBook.perUnit", { unit: unitLabel(t, item.work_item.unit) })}
            {hasBand
              ? ` · ${formatMoney(item.floor_paise as number)} – ${formatMoney(item.ceiling_paise as number)}`
              : null}
          </p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={isActive}
          aria-label={isActive ? t("money.priceBook.switch.active") : t("money.priceBook.switch.inactive")}
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

      {hasBand ? null : (
        <p className="text-xs text-warning-text">
          {t("money.priceBook.noBand")}
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
          aria-label={t("money.priceBook.rateInputAriaLabel", { item: item.work_item.name })}
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
          loadingLabel={t("common.saving")}
          onClick={save}
        >
          {t("common.save")}
        </Button>
      </div>

      {item.is_default_rate && hasBand ? (
        <p className="text-xs text-text-muted">{t("money.priceBook.cityRate")}</p>
      ) : null}

      {errorMessage ? (
        <ErrorState inline severity="error" title={t("money.priceBook.saveError.title")} message={errorMessage} />
      ) : null}
    </Card>
  );
}

const UNIT_LABEL_KEYS: Record<string, string> = {
  each: "money.unit.each",
  job: "money.unit.job",
  hour: "money.unit.hour",
  day: "money.unit.day",
  sq_ft: "money.unit.sqFt",
  running_ft: "money.unit.runningFt",
  metre: "money.unit.metre",
  kg: "money.unit.kg",
  litre: "money.unit.litre",
  set: "money.unit.set",
};

function unitLabel(t: ReturnType<typeof useT>, unit: string): string {
  const key = UNIT_LABEL_KEYS[unit];
  return key ? t(key) : unit;
}
