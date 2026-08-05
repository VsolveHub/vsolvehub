"use client";

import type { ReactNode } from "react";

/**
 * Shared furniture for the account screens.
 *
 * The account area answers one question across four screens — *what does Vsolve
 * Hub hold about me, and who can act on it?* — so the screens share a shape: a
 * heading that names the record, a sentence saying what it is for, and rows that
 * each carry a server-owned timestamp.
 *
 * The house signature, the `Readout` plate, is deliberately **not** used here.
 * It exists for the three values that must not be misread across a doorway —
 * price, countdown, door code — and spending it on a "last seen" stamp would
 * make it ordinary. These screens are a ledger, and a ledger should be quiet.
 */

export function AccountSection({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-card border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="max-w-prose">
          <h2 className="text-lg font-bold text-text">{title}</h2>
          <p className="mt-1 text-sm text-text-secondary">{description}</p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

/**
 * A note about a limit of the product, stated rather than hidden.
 *
 * Used where the API genuinely cannot do something a customer would reasonably
 * expect. Saying so in the interface is better than an empty panel that looks
 * broken, and far better than filling the gap with something we did not read
 * from the server.
 */
export function AccountNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-control border border-info-line bg-info-surface px-3 py-2.5 text-sm text-info-text">
      {children}
    </p>
  );
}

const DATE_TIME = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const DATE_ONLY = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/**
 * A server timestamp, rendered in the reader's own zone.
 *
 * `dateTime` keeps the ISO instant in the markup so assistive technology and
 * anything parsing the page get the unambiguous value, while the visible text is
 * local. Invalid or absent input renders nothing rather than "Invalid Date",
 * which is the sort of thing that reaches production because the happy path was
 * the only one tried.
 */
export function Moment({
  value,
  dateOnly = false,
  className,
}: {
  value: string | null | undefined;
  dateOnly?: boolean;
  className?: string;
}) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  return (
    <time dateTime={value} className={className}>
      {(dateOnly ? DATE_ONLY : DATE_TIME).format(parsed)}
    </time>
  );
}
