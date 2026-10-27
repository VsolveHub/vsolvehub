"use client";

import { Card, buttonStyles, useT } from "@vsolve/ui";
import { MessageCircle, Phone, User } from "lucide-react";

import type { EnquiryRecord } from "../model/wire";

/**
 * Who the vendor is meeting.
 *
 * The visit-day contact rung (contract 1.52.0) given its own card rather than a
 * grey strip inside the visit panel. The server decides both fields and a null
 * is a window that has not opened, never an error: the name arrives with the
 * address disclosure, the number only from two hours before the slot until the
 * visit completes. `wire.ts` is the one module that names either wire field —
 * `contact-boundary.test.ts` enforces that, and this card reads the record.
 *
 * ## Why the locked state is still a card
 *
 * "Phone unlocks 2 hours before the visit" used to be right-aligned grey text
 * squeezed beside the name, where it read as an apology. It is a real rule with
 * a real reason, and a vendor who knows the number is coming does not spend the
 * evening before hunting for it. So the row keeps its shape and the button
 * position stays put — what changes is whether it dials.
 *
 * Messaging is always available: the clarification thread is not gated on the
 * visit hour, and "can I park in the compound" is a question worth asking the
 * night before rather than from the gate.
 */

export interface CustomerCardProps {
  readonly enquiry: EnquiryRecord;
  readonly onMessage: () => void;
}

export function CustomerCard({ enquiry, onMessage }: CustomerCardProps) {
  const t = useT();
  if (enquiry.customerName === null) return null;

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-sunken text-action-secondary"
        >
          <User size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
            {t("enquiry.customerCard.visiting")}
          </h2>
          <p className="truncate text-base font-bold text-text">{enquiry.customerName}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {enquiry.customerPhone === null ? (
          <p className="flex items-center justify-center rounded-control border border-dashed border-line px-3 py-2 text-center text-xs font-semibold leading-4 text-text-muted">
            {t("enquiry.customerCard.phoneUnlocks")}
          </p>
        ) : (
          <a
            href={`tel:${enquiry.customerPhone}`}
            className={buttonStyles({ variant: "outline", className: "gap-2" })}
          >
            <Phone size={16} aria-hidden />
            {t("enquiry.customerCard.call")}
          </a>
        )}

        <button
          type="button"
          onClick={onMessage}
          className={buttonStyles({ variant: "outline", className: "gap-2" })}
        >
          <MessageCircle size={16} aria-hidden />
          {t("enquiry.customerCard.message")}
        </button>
      </div>
    </Card>
  );
}
