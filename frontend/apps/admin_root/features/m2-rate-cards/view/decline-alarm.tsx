"use client";

import {
  basisPointsPercent,
  declineAlarmState,
  declineAlarmVerdict,
  declineAlarmsByUrgency,
  type DeclineAlarmReading,
  type DeclineAlarmState,
} from "@vsolve/query";
import { Badge, Card, ErrorState, Spinner, formatMoney } from "@vsolve/ui";
import { AlertTriangle, EyeOff } from "lucide-react";

import { useDeclineAlarm } from "../queries";

/**
 * `M2-FE-713`: the decline-rate alarm.
 *
 * A sustained decline rate is a supply failure somebody has to act on **today**:
 * a published rate below the street rate makes leads decline everything and the
 * instant product dies quietly, at a price the platform set itself. So this is an
 * alarm, not a report — worst first, one sentence per state, and no chart.
 *
 * ## What changed at 1.33.0, and what did not
 *
 * This panel was first built against a gap. The alarm existed, `sweep_rate_card_decline_alarm`
 * paged Operations by email, and **nothing published a reading** — so the only
 * honest screen was one that said it could not tell you whether the alarm was
 * armed, with `armed` hard-typed `false` so no later edit could add a green
 * branch. `GET /operations/rate-cards/decline-alarm/` now publishes the reading,
 * and that statement would itself be a lie, so it is gone.
 *
 * **The reason it was written survives intact.** `armed` is published rather than
 * inferred, and an unarmed card is *measured and published* — measurement never
 * waits on the owner; only the judgement does. So a card can carry a perfectly
 * real 80% decline rate and `breached: false`, because owner decision 13 is open
 * for its skill and **no alarm can ever fire on it**. Deriving the colour from
 * `breached` alone would render that green, with numbers behind it to make it
 * convincing. `declineAlarmState` reads `armed` first, for exactly that reason,
 * and unarmed sorts **above** insufficient-offers: a card nothing is watching is
 * a standing hole, not a temporary absence of evidence.
 *
 * ## An empty board is not a quiet board
 *
 * No readings means **no card is published at all** — a different and worse state
 * than every card being quiet, and it gets its own sentence rather than falling
 * through to "nothing is breached".
 */

const STATE_COPY: Record<
  DeclineAlarmState,
  { badge: string; tone: "danger" | "warning" | "neutral" | "success"; sentence: string }
> = {
  breached: {
    badge: "Breached",
    tone: "danger",
    sentence:
      "Leads are turning this rate down above its threshold. Raise the card, or the instant product stops working in this city.",
  },
  unarmed: {
    badge: "No alarm can fire",
    tone: "warning",
    sentence:
      "No decline threshold is configured for this skill, so nothing will ever page anybody about this card — whatever the rate does. The rate below is real and measured; the judgement is the one that is missing.",
  },
  insufficient_offers: {
    badge: "Not enough offers yet",
    tone: "neutral",
    sentence:
      "A threshold is set, but too few offers have gone out in the window for the rate to mean anything.",
  },
  quiet: {
    badge: "Quiet",
    tone: "success",
    sentence: "A threshold is set, enough offers have gone out, and the rate is under it.",
  },
};

function ReadingRow({ reading }: { reading: DeclineAlarmReading }) {
  const state = declineAlarmState(reading);
  const copy = STATE_COPY[state];

  return (
    <li className="rounded-card border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={copy.tone}>{copy.badge}</Badge>
            <span className="font-semibold text-text">{reading.service_area_slug}</span>
            <span className="text-text-secondary">
              {reading.skill_name}{" "}
              <span className="font-mono text-xs text-text-muted">({reading.skill_code})</span>
            </span>
          </div>
          <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">{copy.sentence}</p>
        </div>

        <div className="text-right">
          <p className="text-2xl font-bold text-text" data-numeric>
            {basisPointsPercent(reading.rate_basis_points)}
          </p>
          <p className="text-xs text-text-secondary">
            {reading.declines} of {reading.offers} offer{reading.offers === 1 ? "" : "s"} declined
            or expired
          </p>
        </div>
      </div>

      <dl className="mt-3 m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-text-secondary">Customer day rate</dt>
        <dd className="m-0 text-right font-medium text-text" data-numeric>
          {formatMoney(reading.customer_day_rate_paise)}
        </dd>
        <dt className="text-text-secondary">Threshold</dt>
        <dd className="m-0 text-right font-medium text-text">
          {/*
            Nullable on purpose: an unarmed card has no threshold, and a `0` in
            its place would read as "alarm on everything". Said in words.
          */}
          {reading.threshold_basis_points === null ? (
            <span className="text-warning-text">not set</span>
          ) : (
            <span data-numeric>{basisPointsPercent(reading.threshold_basis_points)}</span>
          )}
        </dd>
        <dt className="text-text-secondary">Offers needed before it counts</dt>
        <dd className="m-0 text-right font-medium text-text">
          {reading.minimum_offers === null ? (
            <span className="text-warning-text">not set</span>
          ) : (
            <span data-numeric>{reading.minimum_offers}</span>
          )}
        </dd>
      </dl>
    </li>
  );
}

export function DeclineAlarmPanel() {
  const alarm = useDeclineAlarm();

  if (alarm.isPending) {
    return (
      <Card className="flex items-center gap-2 p-5 text-sm text-text-secondary">
        <Spinner size="sm" />
        Reading the decline alarm…
      </Card>
    );
  }

  if (alarm.isError || !alarm.data) {
    return (
      <ErrorState
        title="We could not read the decline alarm"
        message="Nothing has changed, and this says nothing about whether a rate is being declined — treat it as unknown rather than quiet, and try again."
        actionLabel="Try again"
        onAction={() => void alarm.refetch()}
      />
    );
  }

  const board = alarm.data;
  const verdict = declineAlarmVerdict(board);
  const rows = declineAlarmsByUrgency(board);

  const headline =
    verdict === "no_cards"
      ? {
          tone: "warning" as const,
          icon: EyeOff,
          title: "No rate card is published at all",
          body: "There is nothing to measure and nothing to alarm on. Every A3 instant booking is being refused with m2_rate_card_unavailable and every customer is being routed to the quote flow — which is the fail-closed path working, and is not the same as supply being healthy.",
        }
      : verdict === "breached"
        ? {
            tone: "danger" as const,
            icon: AlertTriangle,
            title: `${board.breached_cards} card${board.breached_cards === 1 ? " is" : "s are"} above their decline threshold`,
            body: "Leads are turning these rates down. This pages Operations from the server too; it is here so somebody can see which city and which trade.",
          }
        : verdict === "gaps_in_cover"
          ? {
              tone: "warning" as const,
              icon: EyeOff,
              title: `${board.readings.length - board.armed_cards} of ${board.readings.length} cards have no alarm behind them`,
              body: "Nothing is breached — but nothing can breach on an unarmed card either, whatever its rate does. Those cards need a decline threshold configured for their skill before this screen can tell you anything about them.",
            }
          : {
              tone: "success" as const,
              icon: AlertTriangle,
              title: "Every published card is armed and under its threshold",
              body: "A threshold is configured for every card and none is breached. This is the only state on this screen that means what it looks like it means.",
            };

  const HeadlineIcon = headline.icon;
  const surface =
    headline.tone === "danger"
      ? "border-danger-line bg-danger-surface"
      : headline.tone === "warning"
        ? "border-warning-line bg-warning-surface"
        : "border-success-line bg-success-surface";
  const iconTone =
    headline.tone === "danger"
      ? "text-danger-text"
      : headline.tone === "warning"
        ? "text-warning-text"
        : "text-success-text";

  return (
    <Card className={`${surface} p-5`}>
      <div className="flex items-start gap-3">
        <HeadlineIcon aria-hidden className={`mt-0.5 h-5 w-5 shrink-0 ${iconTone}`} />
        <div className="min-w-0">
          <h2 className="text-base font-bold text-text">Decline-rate alarm</h2>
          <p className="mt-1 font-semibold text-text">{headline.title}</p>
          <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">{headline.body}</p>
          <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">
            Measured over the last <strong className="text-text">{board.window_hours} hours</strong>
            , as a share of offers <strong className="text-text">sent</strong> — a lead who ignores
            an offer until it expires is saying the same thing as one who declines it. When a lead
            does answer, <strong className="text-text">&ldquo;rate too low&rdquo;</strong> is the
            reason that matters; the individual reasons are on each request&rsquo;s own timeline.
          </p>
        </div>
      </div>

      {rows.length > 0 ? (
        <ul className="mt-4 list-none space-y-2 p-0">
          {rows.map((reading) => (
            <ReadingRow key={reading.rate_card_id} reading={reading} />
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
