"use client";

import type { Schemas } from "@vsolve/api-client";
import { useServerCountdown } from "@vsolve/query";
import { Badge, Button, formatMoney } from "@vsolve/ui";

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

const STATUS_TONES: Record<OfferStatus, "neutral" | "success" | "warning" | "danger"> = {
  OFFERED: "warning",
  ACCEPTED_PENDING_UNDO: "success",
  COMMITTED: "success",
  UNDONE: "neutral",
  DECLINED: "neutral",
  EXPIRED: "neutral",
  REVOKED: "neutral",
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
    <p className="text-sm text-text-secondary">
      <span aria-hidden data-numeric className="font-semibold text-text">
        {countdown.display}
      </span>
      <span className="sr-only">{countdown.announce}</span>
      <span> {label}</span>
    </p>
  );
}

function MoneyRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: Schemas["Money"] | null;
  strong?: boolean;
}) {
  if (value === null) return null;
  return (
    <div className={`flex justify-between gap-3 ${strong ? "font-semibold text-text" : ""}`}>
      <dt className={strong ? undefined : "text-text-secondary"}>{label}</dt>
      <dd className="tabular-nums">{formatMoney(value.amount_paise)}</dd>
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

  return (
    <li className="rounded-card border border-line bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold text-text">
          {offer.approximate_area ?? "Area not given"}
        </h3>
        <Badge tone={STATUS_TONES[offer.status]}>{STATUS_LABELS[offer.status]}</Badge>
      </div>

      <p className="mt-1 text-sm text-text-secondary">
        <time dateTime={offer.starts_at ?? undefined}>{formatWhen(offer.starts_at)}</time>
        {offer.estimated_duration_minutes !== null ? (
          <> · about {offer.estimated_duration_minutes} min of work</>
        ) : null}
      </p>

      <div className="mt-2 flex flex-col gap-0.5">
        {isOffered ? <Deadline label="to respond" deadline={offer.expires_at} /> : null}
        {isPendingUndo ? <Deadline label="left to undo" deadline={offer.undo_deadline} /> : null}
      </div>

      <ul className="mt-3 flex flex-col gap-1 text-sm text-text">
        {offer.service_lines.map((line) => (
          <li key={line.line_id} className="flex justify-between gap-3">
            <span>
              {line.service_label}
              {line.quantity > 1 ? (
                <span className="text-text-secondary"> × {line.quantity}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>

      {offer.requirements.length > 0 ? (
        <div className="mt-3">
          <h4 className="text-sm font-semibold text-text">What you need</h4>
          <ul className="mt-1 flex flex-wrap gap-2">
            {offer.requirements.map((requirement) => (
              <li
                key={requirement}
                className="rounded-plate border border-line px-2 py-1 text-xs text-text-secondary"
              >
                {requirement}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <dl className="mt-4 flex flex-col gap-1 border-t border-line pt-3 text-sm">
        <MoneyRow label="Job total" value={offer.estimated_gross} />
        <MoneyRow label="Platform commission" value={offer.commission} />
        <MoneyRow label="You receive" value={offer.estimated_net} strong />
      </dl>
      <p className="mt-1 text-xs text-text-secondary">
        Estimated from the scope above. The final amount follows what is actually done.
      </p>

      {unconfirmedMessage !== null ? (
        <p className="mt-3 text-sm text-critical" role="alert">
          {unconfirmedMessage}
        </p>
      ) : null}

      {isOffered ? (
        <div className="mt-4 flex flex-wrap gap-3">
          <Button onClick={() => onCommand("accept")} loading={isBusy} loadingLabel="Accepting">
            Accept
          </Button>
          <Button variant="outline" onClick={() => onCommand("decline")} disabled={isBusy}>
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
          <div className="mt-3 flex flex-wrap gap-3">
            <Button onClick={() => onCommand("commit")} loading={isBusy} loadingLabel="Committing">
              Commit now
            </Button>
            <Button variant="outline" onClick={() => onCommand("undo")} disabled={isBusy}>
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
    </li>
  );
}
