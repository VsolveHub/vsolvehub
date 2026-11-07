"use client";

import { friendlyErrorMessage } from "@vsolve/query";
import { Badge, Button, Card, Dialog, ErrorState, Field, Spinner, Textarea, formatMoney } from "@vsolve/ui";
import { ChevronRight, Phone } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import type { StepUpSession } from "@/features/finance/queries";
import { StepUpGate } from "@/features/finance/view/step-up-gate";
import { CustomerLedgerPanel } from "@/features/loyalty/view/customer-ledger-panel";

import {
  BOOKING_KIND_LABEL,
  bookingHref,
  useBlockCustomer,
  useCustomerRecord,
  type CustomerRecord as Record_,
} from "../queries";

const WHEN = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });
const WHEN_TIME = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

function BlockAction({ record }: { record: Record_ }) {
  const block = useBlockCustomer(record.id);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const blocking = !record.is_blocked;

  function close() {
    if (block.isPending) return;
    setOpen(false);
    setReason("");
    block.reset();
  }

  return (
    <>
      <Button size="sm" variant={blocking ? "outline" : "primary"} onClick={() => setOpen(true)}>
        {blocking ? "Block account" : "Unblock account"}
      </Button>
      {open ? (
        <Dialog
          open
          onOpenChange={(next) => {
            if (!next) close();
          }}
          title={blocking ? "Block this account?" : "Unblock this account?"}
          description={
            blocking
              ? "They are signed out everywhere at once and cannot sign in until unblocked. Bookings already made are not cancelled."
              : "They can sign in and book again."
          }
          footer={
            <>
              <Button variant="outline" disabled={block.isPending} onClick={close}>
                Cancel
              </Button>
              <Button
                variant={blocking ? "danger" : "primary"}
                disabled={!reason.trim()}
                loading={block.isPending}
                loadingLabel="Saving"
                onClick={() =>
                  block.mutate(
                    { blocked: blocking, reason: reason.trim() },
                    {
                      onSuccess: () => {
                        setOpen(false);
                        setReason("");
                      },
                    },
                  )
                }
              >
                {blocking ? "Block" : "Unblock"}
              </Button>
            </>
          }
        >
          <Field label="Reason" description="Kept in the account's history." required>
            <Textarea rows={3} value={reason} maxLength={480} onChange={(event) => setReason(event.target.value)} />
          </Field>
          {block.error ? (
            <p role="alert" className="mt-3 text-sm text-danger-text">
              {friendlyErrorMessage(block.error)}
            </p>
          ) : null}
        </Dialog>
      ) : null}
    </>
  );
}

function Money({ record }: { record: Record_ }) {
  const [session, setSession] = useState<StepUpSession | null>(null);
  const [stepUpReason, setStepUpReason] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState(false);

  return (
    <Card padding="md">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-navy-900">Wallet and coins</h2>
          <dl className="mt-2 flex flex-wrap gap-6 text-sm">
            <div>
              <dt className="text-text-secondary">Wallet</dt>
              <dd className="text-lg font-bold text-navy-900" data-numeric>
                {formatMoney(record.wallet_balance_paise)}
              </dd>
            </div>
            <div>
              <dt className="text-text-secondary">Spendable coins</dt>
              <dd className="text-lg font-bold text-navy-900" data-numeric>
                {record.coins_spendable}
              </dd>
            </div>
          </dl>
        </div>
        <Button size="sm" variant="outline" onClick={() => setCorrecting((value) => !value)}>
          {correcting ? "Hide history and corrections" : "History and corrections"}
        </Button>
      </div>
      {correcting ? (
        <div className="mt-4 flex flex-col gap-4 border-t border-line pt-4">
          {/* Corrections move money, so they sit behind the same step-up as refunds. */}
          <StepUpGate
            session={session}
            reason={stepUpReason ?? undefined}
            onSteppedUp={(stepped) => {
              setSession(stepped);
              setStepUpReason(null);
            }}
          />
          <CustomerLedgerPanel phone={record.phone_number} onStepUpRequired={setStepUpReason} />
        </div>
      ) : null}
    </Card>
  );
}

/**
 * One customer: how to reach them, every booking across services, their money, open cases, and
 * block or unblock. Opened from Customers, where they are found by phone or name.
 */
export function CustomerRecord({ customerId }: { customerId: string }) {
  const record = useCustomerRecord(customerId);

  if (record.isPending) {
    return (
      <p className="flex items-center gap-2 text-sm text-text-secondary">
        <Spinner size="sm" /> Loading the customer…
      </p>
    );
  }
  if (record.isError || !record.data) {
    return (
      <ErrorState
        severity="warning"
        title="This customer could not be opened"
        message="They may not be a customer, or the link is wrong."
        actionLabel="Try again"
        onAction={() => void record.refetch()}
      />
    );
  }

  const customer = record.data;
  return (
    <div className="flex flex-col gap-4">
      <Card padding="md">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-navy-900">{customer.full_name || "No name given"}</h1>
              {customer.is_blocked ? <Badge tone="danger">Blocked</Badge> : null}
            </div>
            <p className="mt-1 text-sm text-text-secondary">
              Joined {WHEN.format(new Date(customer.date_joined))}
              {customer.email ? ` · ${customer.email}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={`tel:${customer.phone_number}`}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-control border border-line px-3 text-sm font-semibold text-text hover:bg-surface-sunken"
            >
              <Phone aria-hidden className="size-4" /> Call {customer.phone_number}
            </a>
            <BlockAction record={customer} />
          </div>
        </div>
        {customer.block ? (
          <p className="mt-3 rounded-control border border-danger-line bg-danger-surface p-3 text-sm text-danger-text">
            Blocked {WHEN_TIME.format(new Date(customer.block.at))}
            {customer.block.by ? ` by ${customer.block.by}` : ""}: {customer.block.reason}
          </p>
        ) : null}
        {customer.partner_id ? (
          <p className="mt-3 text-sm text-text-secondary">
            This person is also a partner.{" "}
            <Link
              href={`/operations/partners?partner=${customer.partner_id}`}
              className="font-semibold text-text-link hover:underline"
            >
              Open their partner record
            </Link>
          </p>
        ) : null}
      </Card>

      <Money record={customer} />

      <Card padding="md">
        <h2 className="text-base font-bold text-navy-900">Bookings</h2>
        {customer.bookings.length === 0 ? (
          <p className="mt-2 text-sm text-text-secondary">No bookings yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {customer.bookings.map((booking) => (
              <li key={`${booking.kind}-${booking.id}`} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-navy-900">{booking.title}</p>
                  <p className="text-sm text-text-secondary">
                    {BOOKING_KIND_LABEL[booking.kind]} · {WHEN.format(new Date(booking.when))}
                    {typeof booking.total_paise === "number" ? ` · ${formatMoney(booking.total_paise)}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge tone="neutral">{booking.status_label}</Badge>
                  <Link
                    href={bookingHref(booking)}
                    className="inline-flex items-center gap-1 text-sm font-semibold text-text-link hover:underline"
                  >
                    Open <ChevronRight aria-hidden className="size-4" />
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {customer.open_quotes.length > 0 ? (
        <Card padding="md">
          <h2 className="text-base font-bold text-navy-900">Quotes waiting to be paid</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Quotes they built but have not paid for. Check out for them only with their consent.
          </p>
          <ul className="mt-3 divide-y divide-line">
            {customer.open_quotes.map((quote) => (
              <li key={quote.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-navy-900">{quote.title}</p>
                  <p className="text-sm text-text-secondary">
                    {formatMoney(quote.total_paise)} · expires {WHEN_TIME.format(new Date(quote.expires_at))}
                  </p>
                </div>
                <Link
                  href={`/operations/home-services?tab=book&customer=${customer.id}&quote=${quote.id}`}
                  className="inline-flex items-center gap-1 text-sm font-semibold text-text-link hover:underline"
                >
                  Check out for them <ChevronRight aria-hidden className="size-4" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card padding="md">
        <h2 className="text-base font-bold text-navy-900">Open cases</h2>
        {customer.open_cases.length === 0 ? (
          <p className="mt-2 text-sm text-text-secondary">No open cases.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {customer.open_cases.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <p className="min-w-0 truncate text-navy-900">{item.summary}</p>
                <Link
                  href={`/operations/cases?case=${item.id}`}
                  className="inline-flex items-center gap-1 text-sm font-semibold text-text-link hover:underline"
                >
                  Open case <ChevronRight aria-hidden className="size-4" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
