"use client";

import { daysEffective, declineAlarmStatement, type RateCardHistory } from "@vsolve/query";
import { Badge, Card } from "@vsolve/ui";
import { AlertTriangle } from "lucide-react";

import { maskId } from "@/features/shared/identifiers";

/**
 * `M2-FE-713`: the decline-rate alarm.
 *
 * ## It is an alarm, and this console cannot tell you whether it is armed
 *
 * A sustained decline rate is a supply failure that needs somebody to act today:
 * a published rate below the street rate makes leads decline everything and the
 * instant product dies quietly, at a rate the platform published itself. So the
 * design is a **page**, not a chart — `sweep_rate_card_decline_alarm` runs on
 * the beat schedule, `breached_decline_rates` measures declines *and expiries*
 * as a share of offers **sent** (a lead who ignores an offer until it expires is
 * saying the same thing as one who declines it), and a breach notifies
 * Operations.
 *
 * What contract 1.32.0 does **not** publish is any read of it. There is no
 * endpoint for the rate, the threshold, the window or the per-card decline
 * reasons. Logged as a contract gap in `frontend-execution-plan.md` §7.
 *
 * ## Why this panel refuses to show a green state
 *
 * The threshold is owner-blocked configuration. `rate_cards.decline_alarm_policy`
 * answers `None` while owner decision 13 is open, and `breached_decline_rates`
 * then **skips** the card rather than alarming on it — correctly, because
 * inventing a percentage would be worse. The consequence is that an unset
 * threshold means *no alarm can ever fire*.
 *
 * So "no page arrived" has two causes this console cannot tell apart: nothing
 * breached, or nothing could. A green tick over that would be the single most
 * expensive lie this screen could tell — it would say the supply side is healthy
 * on exactly the deployment where nobody would ever be told it was not. There is
 * one state here and it is "unknown", stated in those words.
 *
 * ## What it can honestly show: the review backstop
 *
 * `M2-FE-713` names the monthly review calendar as the alarm's backstop, and
 * that **is** readable — every card publishes its effective date, and the list
 * publishes the server's own `server_now`. So this panel ranks the published
 * cards by how long each price has stood without revision. A rate nobody has
 * looked at in months is the thing the alarm exists to catch, and it is visible
 * without the alarm.
 */

/**
 * How long a price may stand before the monthly review calendar says look at it.
 *
 * A **review prompt**, deliberately not a threshold and deliberately not
 * owner-blocked configuration: it decides nothing, refuses nothing, and changes
 * no number. `M2-FE-713` names the monthly review as the backstop and a month is
 * what monthly means. Every owner-blocked value on this project fails closed
 * instead of carrying a default; this one carries a default because getting it
 * wrong shows somebody a card slightly early or slightly late.
 */
const REVIEW_PROMPT_DAYS = 30;

export function DeclineAlarmPanel({
  histories,
  serverNow,
  areaNames,
}: {
  histories: readonly RateCardHistory[];
  /** The server's own clock, from the same response as the cards. Null while loading. */
  serverNow: string | null;
  areaNames: ReadonlyMap<string, string>;
}) {
  const statement = declineAlarmStatement();

  const overdue =
    serverNow === null
      ? []
      : histories
          .flatMap((history) =>
            history.live === null
              ? []
              : [
                  {
                    groupKey: history.groupKey,
                    serviceArea: history.serviceArea,
                    skill: history.skill,
                    days: daysEffective(history.live, serverNow),
                    hasScheduledRevision: history.scheduled.length > 0,
                  },
                ],
          )
          .filter((row) => row.days >= REVIEW_PROMPT_DAYS)
          .sort((left, right) => right.days - left.days);

  return (
    <Card className="border-warning-line bg-warning-surface p-5">
      <div className="flex items-start gap-3">
        <AlertTriangle aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-warning-text" />
        <div className="min-w-0">
          <h2 className="text-base font-bold text-text">Decline-rate alarm</h2>
          {/*
            The one status this panel has. It is not a pass and it never becomes
            one on this build — `armed` is typed `false`, so a later edit cannot
            accidentally render a green branch that does not exist.
          */}
          <p className="mt-1 font-semibold text-warning-text">{statement.headline}</p>
          <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">
            {statement.detail}
          </p>
          <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">
            When a lead passes on a job the reason is required, and{" "}
            <strong>&ldquo;rate too low&rdquo;</strong> is the one that matters: it is the market
            telling you this card is under the street rate. Those reasons are visible per request
            on the request timeline, against the vendor who gave them — they are not aggregated
            anywhere a screen can read.
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-control bg-surface p-4">
        <h3 className="text-sm font-semibold text-text">
          The backstop: prices standing {REVIEW_PROMPT_DAYS} days or more
        </h3>
        <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
          Read from the published effective dates against the server&rsquo;s clock. This is the
          monthly review calendar, and while the alarm cannot be read it is the only warning
          available.
        </p>

        {serverNow === null ? (
          <p className="mt-3 text-sm text-text-secondary">Waiting for the published cards…</p>
        ) : overdue.length === 0 ? (
          <p className="mt-3 text-sm text-text-secondary">
            No published card has stood {REVIEW_PROMPT_DAYS} days without a revision.{" "}
            <strong className="text-text">
              That is a statement about revision dates, not about decline rates.
            </strong>{" "}
            It does not mean leads are accepting these rates.
          </p>
        ) : (
          <ul className="mt-3 list-none space-y-2 p-0">
            {overdue.map((row) => (
              <li
                key={row.groupKey}
                className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-line p-3 text-sm"
              >
                <span>
                  <strong className="text-text">
                    {areaNames.get(row.serviceArea) ?? `City ${maskId(row.serviceArea)}`}
                  </strong>
                  <span className="text-text-secondary">
                    {" "}
                    · skill <span className="font-mono">{maskId(row.skill)}</span>
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  {row.hasScheduledRevision ? (
                    <Badge tone="info">A revision is scheduled</Badge>
                  ) : null}
                  <Badge tone={row.days >= REVIEW_PROMPT_DAYS * 3 ? "danger" : "warning"}>
                    {row.days} days at this price
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
