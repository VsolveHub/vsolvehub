"use client";

import type { Schemas } from "@vsolve/api-client";
import { useServerCountdown } from "@vsolve/query";
import { Button, cn, formatMoney } from "@vsolve/ui";
import { Clock } from "lucide-react";

import type { Offer, OfferAction, OfferStatus } from "../queries";

/**
 * One offer, for one Fulfilment Unit.
 *
 * ## Only what the offer carries
 *
 * Everything rendered below is a field on this offer. There is no lookup, no
 * join and no inference — in particular nothing derives a Customer, an exact
 * address or a sibling visit from `checkout_id`. The server withheld those on
 * purpose; reconstructing any of them here would defeat a boundary that exists
 * for the Customer's safety and the Partner's.
 *
 * `approximate_area` is shown as the area it is. A map, a distance or a
 * street name would all be claims this payload cannot support.
 *
 * ## The money is snapshotted, and shown in full
 *
 * Gross, commission and net all arrive as server-calculated Money. Showing gross
 * alone would be the number a Partner remembers and not the one they are paid;
 * showing net alone hides the deduction. All three, with the commission plainly
 * subtracted, is the only honest version.
 */

const STATUS_LABELS: Record<OfferStatus, string> = {
  OFFERED: "Offered to you",
  ACCEPTED_PENDING_UNDO: "Accepted — you can still undo",
  COMMITTED: "Committed",
  UNDONE: "Undone",
  DECLINED: "Declined",
  EXPIRED: "Expired",
  REVOKED: "Withdrawn",
};

/** Background, text and accent for the status header strip. */
const STATUS_STYLES: Record<OfferStatus, { bg: string; text: string; border: string }> = {
  OFFERED: {
    bg: "bg-warning-surface",
    text: "text-warning-text",
    border: "border-l-signal-500",
  },
  ACCEPTED_PENDING_UNDO: {
    bg: "bg-success-surface",
    text: "text-success-text",
    border: "border-l-success-text",
  },
  COMMITTED: {
    bg: "bg-success-surface",
    text: "text-success-text",
    border: "border-l-success-text",
  },
  UNDONE: {
    bg: "bg-surface-sunken",
    text: "text-text-secondary",
    border: "border-l-line-strong",
  },
  DECLINED: {
    bg: "bg-surface-sunken",
    text: "text-text-secondary",
    border: "border-l-line-strong",
  },
  EXPIRED: {
    bg: "bg-surface-sunken",
    text: "text-text-secondary",
    border: "border-l-line-strong",
  },
  REVOKED: {
    bg: "bg-surface-sunken",
    text: "text-text-secondary",
    border: "border-l-line-strong",
  },
};

function formatWhen(instant: string | null): string {
  if (instant === null) return "Time not given";
  return new Date(instant).toLocaleString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * A countdown rendered from the server clock.
 *
 * The digits are hidden from assistive technology and replaced with a coarse
 * phrase: a per-second string inside a live region makes a screen reader
 * unusable, and this one would be doing it beside a 120-second decision.
 */
function Deadline({ label, deadline }: { label: string; deadline: string | null }) {
  const countdown = useServerCountdown(deadline, 1000);
  if (countdown === null || countdown.isExpired) return null;

  return (
    <span className="flex items-center gap-1 text-sm font-semibold">
      <Clock size={14} aria-hidden />
      <span aria-hidden data-numeric>
        {countdown.display}
      </span>
      <span className="sr-only">{countdown.announce}</span>
      <span className="font-normal"> {label}</span>
    </span>
  );
}

function MoneyRow({
  label,
  value,
  strong = false,
  negative = false,
}: {
  label: string;
  value: Schemas["Money"] | null;
  strong?: boolean;
  negative?: boolean;
}) {
  if (value === null) return null;
  return (
    <div className={cn("flex justify-between gap-3 text-sm", strong && "font-semibold text-text")}>
      <dt className={strong ? undefined : "text-text-secondary"}>{label}</dt>
      <dd className={cn("tabular-nums", negative && "text-danger-text")}>
        {formatMoney(value.amount_paise)}
      </dd>
    </div>
  );
}

export interface OfferCardProps {
  offer: Offer;
  /** True while any command for *this* offer is in flight. */
  isBusy: boolean;
  /** Set when this offer's last command failed and the outcome is unknown. */
  unconfirmedMessage: string | null;
  onCommand: (action: OfferAction) => void;
}

export function OfferCard({ offer, isBusy, unconfirmedMessage, onCommand }: OfferCardProps) {
  const isOffered = offer.status === "OFFERED";
  const isPendingUndo = offer.status === "ACCEPTED_PENDING_UNDO";
  const style = STATUS_STYLES[offer.status];
  const isTerminal =
    offer.status === "EXPIRED" ||
    offer.status === "DECLINED" ||
    offer.status === "UNDONE" ||
    offer.status === "REVOKED";

  return (
    <li className="overflow-hidden rounded-card border border-line bg-surface shadow-[var(--shadow-card)]">
      {/* ---- Status header strip ---- */}
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-2 border-l-[3px] px-4 py-2.5",
          style.bg,
          style.text,
          style.border,
        )}
      >
        <span className="text-xs font-bold uppercase tracking-wide">
          {STATUS_LABELS[offer.status]}
        </span>
        {isOffered ? (
          <Deadline label="to respond" deadline={offer.expires_at} />
        ) : null}
        {isPendingUndo ? (
          <Deadline label="left to undo" deadline={offer.undo_deadline} />
        ) : null}
      </div>

      {/* ---- Body ---- */}
      <div className={cn("p-4", isTerminal && "opacity-60")}>
        {/* Service + area + money */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-text">
              {offer.approximate_area ?? "Area not given"}
            </h3>
            <p className="mt-0.5 text-sm font-medium text-text-secondary">
              {offer.service_lines.map((l) => l.service_label).join(", ")}
            </p>
          </div>
        </div>

        {/* When + duration */}
        <p className="mt-2 flex items-center gap-1 text-sm text-text-secondary">
          <time dateTime={offer.starts_at ?? undefined}>{formatWhen(offer.starts_at)}</time>
          {offer.estimated_duration_minutes !== null ? (
            <> · ~{offer.estimated_duration_minutes} min work</>
          ) : null}
        </p>

        {/* Requirements */}
        {offer.requirements.length > 0 ? (
          <div className="mt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
              Requirements
            </p>
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {offer.requirements.map((requirement) => (
                <li
                  key={requirement}
                  className="rounded-plate border border-line bg-surface-sunken px-2.5 py-1 text-xs text-text-secondary"
                >
                  {requirement}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Money breakdown */}
        <dl className="mt-3 flex flex-col gap-1 rounded-card border border-line bg-surface-sunken p-3">
          <MoneyRow label="Job total" value={offer.estimated_gross} />
          <MoneyRow label="Commission" value={offer.commission} negative />
          <div className="my-1 border-t border-line" />
          <MoneyRow label="You receive" value={offer.estimated_net} strong />
        </dl>
        <p className="mt-1.5 text-[0.6875rem] text-text-muted">
          Estimated from the scope above. The final amount follows what is actually done.
        </p>

        {/* Unconfirmed message */}
        {unconfirmedMessage !== null ? (
          <p className="mt-3 text-sm text-critical" role="alert">
            {unconfirmedMessage}
          </p>
        ) : null}

        {/* Action buttons */}
        {isOffered ? (
          <div className="mt-4 flex gap-3">
            <Button
              className="flex-1"
              onClick={() => onCommand("accept")}
              loading={isBusy}
              loadingLabel="Accepting"
            >
              Accept
            </Button>
            <Button
              className="flex-1"
              variant="outline"
              onClick={() => onCommand("decline")}
              disabled={isBusy}
            >
              Decline
            </Button>
          </div>
        ) : null}

        {isPendingUndo ? (
          <div className="mt-4">
            <p className="text-sm text-text-secondary">
              This is yours. You can still undo at no cost until the timer runs out, or commit
              now to lock it in.
            </p>
            <div className="mt-3 flex gap-3">
              <Button
                className="flex-1"
                onClick={() => onCommand("commit")}
                loading={isBusy}
                loadingLabel="Committing"
              >
                Commit now
              </Button>
              <Button
                className="flex-1"
                variant="outline"
                onClick={() => onCommand("undo")}
                disabled={isBusy}
              >
                Undo — no penalty
              </Button>
            </div>
          </div>
        ) : null}

        {offer.status === "COMMITTED" ? (
          <p className="mt-4 text-sm text-text-secondary">
            Committed. The job details will appear in your work list when that is available.
          </p>
        ) : null}
      </div>
    </li>
  );
}
