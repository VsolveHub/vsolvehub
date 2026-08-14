"use client";

import { ApiRequestError } from "@vsolve/api-client";
import {
  daysEffective,
  describeError,
  publishRefusalFor,
  rateCardAddOns,
  rateCardComponents,
  rateCardInclusions,
  rateCardHistories,
  rateCardTotals,
  type OperationsRateCard,
  type PublishRefusal,
  type RateCardHistory,
  type RateCardPublish,
} from "@vsolve/query";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Select,
  Spinner,
  formatMoney,
} from "@vsolve/ui";
import { useMemo, useState } from "react";

import { isUuid, maskId } from "@/features/shared/identifiers";

import { usePublishRateCard, useRateCards, useServiceAreas } from "../queries";
import { DeclineAlarmPanel } from "./decline-alarm";

/**
 * `M2-FE-712`: publishing and revising the A3 day rate, per city and per skill.
 *
 * **This is the screen that decides what every A3 customer is charged.** A
 * mistake here is priced into every booking made against the card until somebody
 * notices, and the card is immutable once published — so the only correction is
 * a second card at a later date, and the wrong number stays true of every
 * booking made in between. Everything below follows from that.
 *
 * ## The three components are shown separately and are never blended
 *
 * The worker's day wage, the lead's supervision margin and the platform booking
 * fee are published as three fields and rendered as three rows. They are not
 * added together anywhere in this file. The two totals a customer and a lead
 * actually see — `customer_day_rate_paise` and `lead_day_receipt_paise` — are
 * **published**, computed server-side and frozen onto every booking; recomputing
 * them here would produce a second answer that agrees today and cannot be relied
 * on to agree tomorrow, on the one screen where being quietly wrong is most
 * expensive.
 *
 * The split is published on this surface and nowhere else, and the reason is
 * this screen: reviewing a rate against the statutory wage floor means seeing
 * the wage part of it. A single blended number would make the monthly review a
 * screen you cannot review from.
 *
 * ## Effective dating, and why the date field starts empty
 *
 * A card is loaded, never edited. `effective_from` is required and has no
 * default here for the reason the contract gives it none: "today" is the one
 * value a publisher should never get by omission, because it is the value that
 * lands under live bookings. A card cannot be backdated under a live booking and
 * the server refuses it — named, below, rather than shown as a generic 409.
 *
 * ## The floor check, and naming the refusal
 *
 * A card whose wage component sits below the statutory floor **cannot publish**,
 * and the refusal says which component, against which rule, and that raising the
 * other two will not help. A platform that refuses a vendor's rate for being
 * below the floor and publishes its own below it has no rule at all. The check
 * also fails **closed**: when no floor is loaded for the area's state and skill,
 * or the area carries no state code, publishing is refused rather than skipped.
 */

const REFUSAL_COPY: Record<PublishRefusal, { title: string; message: string }> = {
  below_wage_floor: {
    title: "The worker day wage is below the statutory floor",
    message:
      "This card was not published and nothing has changed. The wage component is under the " +
      "statutory minimum for this city's state and this skill. Raising the supervision margin or " +
      "the booking fee will not fix it — the floor applies to the wage component alone, which is " +
      "the whole point of publishing the three separately. It is the same refusal a vendor gets " +
      "for quoting under the floor.",
  },
  no_floor_loaded: {
    title: "No wage floor is loaded for this city and skill",
    message:
      "This card was not published and nothing has changed. Either no floor exists for this " +
      "state and skill, or the service area carries no state code. The check fails closed rather " +
      "than being skipped: a rate published with no floor to measure it against is a rate nobody " +
      "checked. Load the floor first.",
  },
  backdated_under_live_booking: {
    title: "That effective date would land under a live booking",
    message:
      "This card was not published and nothing has changed. A booking has already been made at " +
      "the current rate on or after that date, and changing the number it was priced at " +
      "retroactively is not something a card can do. Publish it from a later date.",
  },
  other: {
    title: "We could not publish this card",
    message: "Nothing has changed.",
  },
};

function PublishRefusalState({ error }: { error: unknown }) {
  if (error instanceof ApiRequestError) {
    const refusal = publishRefusalFor(error.code, error.status);
    const copy = REFUSAL_COPY[refusal];
    return (
      <ErrorState
        inline
        className="mt-4"
        title={copy.title}
        // The server's own sentence is kept beside ours: ours names the rule,
        // theirs names the instance.
        message={refusal === "other" ? `${copy.message} ${error.message}` : copy.message}
        reference={error.requestId}
      />
    );
  }
  const presentation = describeError(error, "mutation");
  return (
    <ErrorState
      inline
      className="mt-4"
      severity={presentation.severity}
      title={presentation.title}
      message={presentation.message}
      reference={presentation.reference}
    />
  );
}

/* ---------------------------------------------------------------------------
   Reading a card
   --------------------------------------------------------------------------- */

function CardDetail({
  card,
  serverNow,
  live,
}: {
  card: OperationsRateCard;
  serverNow: string;
  live: boolean;
}) {
  const components = rateCardComponents(card);
  const totals = rateCardTotals(card);
  const inclusions = rateCardInclusions(card);
  const addOns = rateCardAddOns(card);
  const age = daysEffective(card, serverNow);

  return (
    <li className="rounded-card border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        {live ? (
          <Badge tone="success">Pricing bookings now</Badge>
        ) : age < 0 ? (
          <Badge tone="info">Scheduled</Badge>
        ) : (
          <Badge tone="neutral">Superseded</Badge>
        )}
        <span className="text-sm text-text-secondary">
          Effective from <time dateTime={card.effective_from}>{card.effective_from}</time>
          {age >= 0 ? ` · ${age} day${age === 1 ? "" : "s"} ago` : ` · in ${-age} day${age === -1 ? "" : "s"}`}
        </span>
      </div>

      {/*
        Three rows, never one number. The wage row carries its own explanation
        because it is the one the floor applies to.
      */}
      <dl className="mt-3 m-0 space-y-2">
        {components.map((component) => (
          <div key={component.key} className="flex flex-wrap items-baseline justify-between gap-2">
            <dt className="min-w-0">
              <span className="text-sm font-semibold text-text">{component.label}</span>
              <span className="block max-w-prose text-xs leading-5 text-text-secondary">
                {component.explanation}
              </span>
            </dt>
            <dd className="m-0 text-base font-bold text-text" data-numeric>
              {formatMoney(component.paise)}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-3 grid gap-2 rounded-control bg-surface-sunken p-3 sm:grid-cols-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-text-muted">Customer pays per day</p>
          <p className="text-lg font-bold text-text" data-numeric>
            {formatMoney(totals.customerPaysPaise)}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-text-muted">Lead receives per day</p>
          <p className="text-lg font-bold text-text" data-numeric>
            {formatMoney(totals.leadReceivesPaise)}
          </p>
        </div>
        <p className="text-xs leading-5 text-text-secondary sm:col-span-2">
          Both figures are published by the server and frozen onto every booking made against this
          card. They are shown, not added up from the three components above.
        </p>
      </div>

      <dl className="mt-3 m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-text-secondary">Standard day</dt>
        <dd className="m-0 text-right font-medium text-text">{card.standard_day_hours} hours</dd>
        <dt className="text-text-secondary">Overtime, per hour</dt>
        <dd className="m-0 text-right font-medium text-text" data-numeric>
          {formatMoney(card.overtime_hourly_paise)}
        </dd>
        {card.source_reference ? (
          <>
            <dt className="text-text-secondary">Source</dt>
            <dd className="m-0 text-right font-medium text-text">{card.source_reference}</dd>
          </>
        ) : null}
      </dl>

      {inclusions.length > 0 ? (
        <div className="mt-3">
          <p className="text-sm font-semibold text-text">Printed on the customer&rsquo;s booking</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-text-secondary">
            {inclusions.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {addOns.length > 0 ? (
        <div className="mt-3">
          <p className="text-sm font-semibold text-text">Published add-ons</p>
          <ul className="mt-1 list-none space-y-0.5 p-0 text-sm text-text-secondary">
            {addOns.map((row) => (
              <li key={row.name}>
                {row.name.replaceAll("_", " ")} — <span data-numeric>{formatMoney(row.paise)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </li>
  );
}

function HistoryCard({
  history,
  serverNow,
  cityName,
}: {
  history: RateCardHistory;
  serverNow: string;
  cityName: string | null;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? history.cards : history.cards.slice(0, 1);

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-text">
            {cityName ?? `City ${maskId(history.serviceArea)}`}
          </h3>
          {/*
            The skill can only be shown as an id: `GET /partner/skills/`
            publishes `code` and `name` and omits the uuid these cards are keyed
            on, so nothing maps one to the other. Said out loud rather than
            rendered as if the id were a name.
          */}
          <p className="mt-0.5 text-sm text-text-secondary">
            Skill <span className="font-mono">{maskId(history.skill)}</span> — the contract
            publishes no name for a skill id.
          </p>
        </div>
        <div className="text-right text-sm text-text-secondary">
          {history.cards.length} card{history.cards.length === 1 ? "" : "s"}
          {history.scheduled.length > 0 ? (
            <span className="block text-info-text">
              {history.scheduled.length} scheduled ahead
            </span>
          ) : null}
        </div>
      </div>

      {history.live === null ? (
        <ErrorState
          inline
          className="mt-3"
          severity="warning"
          title="Nothing is pricing bookings for this pair"
          message="Every card here is dated in the future. Until one takes effect, an A3 booking for this city and skill is refused with m2_rate_card_unavailable and the customer is routed to the quote flow — never given a guessed price."
        />
      ) : null}

      <ul className="mt-4 list-none space-y-3 p-0">
        {visible.map((card) => (
          <CardDetail
            key={card.id}
            card={card}
            serverNow={serverNow}
            live={history.live?.id === card.id}
          />
        ))}
      </ul>

      {history.cards.length > 1 ? (
        <Button className="mt-3" size="sm" variant="ghost" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Show only the current card" : `Show all ${history.cards.length} revisions`}
        </Button>
      ) : null}
    </Card>
  );
}

/* ---------------------------------------------------------------------------
   Publishing
   --------------------------------------------------------------------------- */

interface KeyedRow {
  readonly id: number;
  key: string;
  value: string;
}

function rupeesToPaise(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "" || !/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const paise = Math.round(Number.parseFloat(trimmed) * 100);
  return Number.isSafeInteger(paise) && paise > 0 ? paise : null;
}

function PublishForm({ areas }: { areas: readonly { id: string; name: string }[] }) {
  const publish = usePublishRateCard();

  const [serviceAreaId, setServiceAreaId] = useState("");
  const [skillId, setSkillId] = useState("");
  const [wage, setWage] = useState("");
  const [margin, setMargin] = useState("");
  const [fee, setFee] = useState("");
  const [dayHours, setDayHours] = useState("");
  const [overtime, setOvertime] = useState("");
  // No default. "Today" is the one value a publisher should never get by
  // omission, because it is the value that lands under live bookings.
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [sourceReference, setSourceReference] = useState("");
  const [inclusions, setInclusions] = useState<KeyedRow[]>([{ id: 1, key: "", value: "" }]);
  const [addOns, setAddOns] = useState<KeyedRow[]>([]);

  const wagePaise = rupeesToPaise(wage);
  const marginPaise = rupeesToPaise(margin);
  const feePaise = rupeesToPaise(fee);
  const overtimePaise = rupeesToPaise(overtime);
  const hours = Number.parseInt(dayHours, 10);
  const hoursValid = Number.isSafeInteger(hours) && hours >= 1 && hours <= 24;
  const inclusionLines = inclusions.map((row) => row.key.trim()).filter((line) => line !== "");
  const addOnRows = addOns
    .map((row) => ({ name: row.key.trim(), paise: rupeesToPaise(row.value) }))
    .filter((row) => row.name !== "" && row.paise !== null);
  const addOnsWellFormed = addOns.every(
    (row) => (row.key.trim() === "" && row.value.trim() === "") ||
      (row.key.trim() !== "" && rupeesToPaise(row.value) !== null),
  );

  const ready =
    serviceAreaId !== "" &&
    isUuid(skillId) &&
    wagePaise !== null &&
    marginPaise !== null &&
    feePaise !== null &&
    overtimePaise !== null &&
    hoursValid &&
    effectiveFrom !== "" &&
    inclusionLines.length > 0 &&
    addOnsWellFormed;

  function submit() {
    if (
      wagePaise === null ||
      marginPaise === null ||
      feePaise === null ||
      overtimePaise === null ||
      !hoursValid
    ) {
      return;
    }
    const body: RateCardPublish = {
      service_area_id: serviceAreaId,
      skill_id: skillId.trim(),
      worker_day_wage_paise: wagePaise,
      supervision_margin_paise: marginPaise,
      booking_fee_paise: feePaise,
      standard_day_hours: hours,
      overtime_hourly_paise: overtimePaise,
      inclusions: inclusionLines,
      add_on_rates: Object.fromEntries(addOnRows.map((row) => [row.name, row.paise as number])),
      effective_from: effectiveFrom,
      source_reference: sourceReference.trim(),
    };
    publish.mutate(body);
  }

  return (
    <Card className="p-5">
      <h2 className="text-base font-bold text-text">Publish a card</h2>
      <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
        One city, one skill, one effective date. A card is never edited — this creates a new row,
        and every booking already made keeps the number it was made at.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="City" required>
          <Select
            value={serviceAreaId}
            onChange={(event) => setServiceAreaId(event.target.value)}
          >
            <option value="">Choose a city…</option>
            {areas.map((area) => (
              <option key={area.id} value={area.id}>
                {area.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Skill id"
          description="Pasted, not picked: no published read maps a skill name to the uuid this card is keyed on. Take it from the variant's wage-floor configuration."
          required
          error={skillId !== "" && !isUuid(skillId) ? "That is not the shape of a skill id." : undefined}
        >
          <Input
            value={skillId}
            spellCheck={false}
            placeholder="00000000-0000-0000-0000-000000000000"
            onChange={(event) => setSkillId(event.target.value)}
          />
        </Field>
      </div>

      <fieldset className="mt-4 rounded-control border border-line p-4">
        <legend className="px-1 text-sm font-semibold text-text">
          The three components — published separately
        </legend>
        <p className="max-w-prose text-sm leading-6 text-text-secondary">
          They are stored and shown apart, and the customer&rsquo;s day rate and the lead&rsquo;s
          receipt are derived from them by the server. Only the first is checked against the
          statutory floor.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Field
            label="Worker day wage (₹)"
            description="Checked against the statutory floor at publish."
            required
          >
            <Input
              value={wage}
              inputMode="decimal"
              data-numeric
              onChange={(event) => setWage(event.target.value)}
            />
          </Field>
          <Field label="Lead supervision margin (₹)" required>
            <Input
              value={margin}
              inputMode="decimal"
              data-numeric
              onChange={(event) => setMargin(event.target.value)}
            />
          </Field>
          <Field label="Platform booking fee (₹)" required>
            <Input
              value={fee}
              inputMode="decimal"
              data-numeric
              onChange={(event) => setFee(event.target.value)}
            />
          </Field>
        </div>
        {/*
          Deliberately no "total" preview. The customer's day rate and the lead's
          receipt are the server's arithmetic and are frozen onto every booking;
          a preview computed here would be a second answer shown at the moment of
          the decision, and the first time it disagreed it would be the one
          somebody trusted.
        */}
        <p className="mt-3 text-sm text-text-secondary">
          The customer&rsquo;s day rate and the lead&rsquo;s receipt appear on the published card
          below. They are not previewed here, because they are the server&rsquo;s arithmetic and
          not this screen&rsquo;s.
        </p>
      </fieldset>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field
          label="Standard day (hours)"
          description="1 to 24. Anything beyond it is overtime."
          required
          error={dayHours !== "" && !hoursValid ? "Between 1 and 24 whole hours." : undefined}
        >
          <Input
            value={dayHours}
            inputMode="numeric"
            data-numeric
            onChange={(event) => setDayHours(event.target.value.replace(/[^\d]/g, ""))}
          />
        </Field>
        <Field label="Overtime, per hour (₹)" required>
          <Input
            value={overtime}
            inputMode="decimal"
            data-numeric
            onChange={(event) => setOvertime(event.target.value)}
          />
        </Field>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field
          label="Effective from"
          description="Required, and deliberately empty until you set it. This is the value that lands under live bookings; a card cannot be backdated under one."
          required
        >
          <Input
            type="date"
            value={effectiveFrom}
            onChange={(event) => setEffectiveFrom(event.target.value)}
          />
        </Field>
        <Field label="Source reference" description="The decision, note or sheet this came from.">
          <Input
            value={sourceReference}
            maxLength={200}
            onChange={(event) => setSourceReference(event.target.value)}
          />
        </Field>
      </div>

      <fieldset className="mt-4 rounded-control border border-line p-4">
        <legend className="px-1 text-sm font-semibold text-text">
          Printed inclusion list — at least one line
        </legend>
        <p className="text-sm text-text-secondary">
          What the day rate covers, in the customer&rsquo;s words. Printed on their booking.
        </p>
        <ul className="mt-3 list-none space-y-2 p-0">
          {inclusions.map((row) => (
            <li key={row.id}>
              <Input
                value={row.key}
                maxLength={200}
                placeholder="Eight hours on site, tools included"
                onChange={(event) =>
                  setInclusions((rows) =>
                    rows.map((entry) =>
                      entry.id === row.id ? { ...entry, key: event.target.value } : entry,
                    ),
                  )
                }
              />
            </li>
          ))}
        </ul>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setInclusions((rows) => [
                ...rows,
                { id: (rows.at(-1)?.id ?? 0) + 1, key: "", value: "" },
              ])
            }
          >
            Add a line
          </Button>
          {inclusions.length > 1 ? (
            <Button size="sm" variant="ghost" onClick={() => setInclusions((r) => r.slice(0, -1))}>
              Remove the last line
            </Button>
          ) : null}
        </div>
      </fieldset>

      <fieldset className="mt-4 rounded-control border border-line p-4">
        <legend className="px-1 text-sm font-semibold text-text">Published add-on rates</legend>
        <p className="text-sm text-text-secondary">
          Optional. Each is a name and a price the customer can be charged on top of the day rate.
        </p>
        <ul className="mt-3 list-none space-y-2 p-0">
          {addOns.map((row) => (
            <li key={row.id} className="grid gap-2 sm:grid-cols-[1fr_10rem]">
              <Input
                value={row.key}
                placeholder="night_shift"
                onChange={(event) =>
                  setAddOns((rows) =>
                    rows.map((entry) =>
                      entry.id === row.id ? { ...entry, key: event.target.value } : entry,
                    ),
                  )
                }
              />
              <Input
                value={row.value}
                inputMode="decimal"
                data-numeric
                placeholder="₹"
                onChange={(event) =>
                  setAddOns((rows) =>
                    rows.map((entry) =>
                      entry.id === row.id ? { ...entry, value: event.target.value } : entry,
                    ),
                  )
                }
              />
            </li>
          ))}
        </ul>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setAddOns((rows) => [...rows, { id: (rows.at(-1)?.id ?? 0) + 1, key: "", value: "" }])
            }
          >
            Add an add-on
          </Button>
          {addOns.length > 0 ? (
            <Button size="sm" variant="ghost" onClick={() => setAddOns((r) => r.slice(0, -1))}>
              Remove the last one
            </Button>
          ) : null}
        </div>
        {!addOnsWellFormed ? (
          <p className="mt-2 text-sm text-danger-text">
            Every add-on needs both a name and a price. Leave a row completely empty to skip it.
          </p>
        ) : null}
      </fieldset>

      {publish.isError ? <PublishRefusalState error={publish.error} /> : null}

      {publish.isSuccess && publish.data ? (
        <div className="mt-4 rounded-control bg-surface-sunken p-3 text-sm">
          <Badge tone="success">Published</Badge>
          <p className="mt-2 text-text-secondary">
            Effective from {publish.data.effective_from}. It is now in the list below and cannot be
            edited — correct it by publishing another card from a later date.
          </p>
        </div>
      ) : null}

      <Button
        className="mt-4"
        disabled={!ready || publish.isPending}
        loading={publish.isPending}
        loadingLabel="Publishing"
        onClick={submit}
      >
        Publish this card
      </Button>
    </Card>
  );
}

/* ---------------------------------------------------------------------------
   The screen
   --------------------------------------------------------------------------- */

export function RateCardBoard() {
  const [city, setCity] = useState("");
  const cards = useRateCards(city === "" ? null : city);
  const areas = useServiceAreas();

  const areaNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const area of areas.data ?? []) map.set(area.id, area.name);
    return map;
  }, [areas.data]);

  const histories = useMemo(
    () => (cards.data ? rateCardHistories(cards.data) : []),
    [cards.data],
  );

  return (
    <div className="space-y-6">
      <DeclineAlarmPanel
        histories={histories}
        serverNow={cards.data?.server_now ?? null}
        areaNames={areaNames}
      />

      <Field label="City" className="max-w-sm">
        <Select value={city} onChange={(event) => setCity(event.target.value)}>
          <option value="">Every city</option>
          {(areas.data ?? []).map((area) => (
            <option key={area.id} value={area.id}>
              {area.name}
            </option>
          ))}
        </Select>
      </Field>

      {cards.isPending ? (
        <p className="flex items-center gap-2 text-sm text-text-secondary">
          <Spinner size="sm" />
          Loading the published cards…
        </p>
      ) : null}

      {cards.isError ? (
        <ErrorState
          title="We could not load the rate cards"
          message="Nothing has changed. Try again."
          actionLabel="Try again"
          onAction={() => void cards.refetch()}
        />
      ) : null}

      {!cards.isPending && !cards.isError && histories.length === 0 ? (
        <EmptyState
          title="No card is published"
          description="Until one is, every A3 instant booking for this city and skill is refused with m2_rate_card_unavailable and the customer collects quotes instead. That is the fail-closed path working — it is never a guessed price."
        />
      ) : null}

      <div className="space-y-4">
        {histories.map((history) => (
          <HistoryCard
            key={history.groupKey}
            history={history}
            serverNow={cards.data?.server_now ?? ""}
            cityName={areaNames.get(history.serviceArea) ?? null}
          />
        ))}
      </div>

      <PublishForm areas={areas.data ?? []} />
    </div>
  );
}
