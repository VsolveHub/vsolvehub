"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { friendlyErrorMessage, usePagedList } from "@vsolve/query";
import {
  Badge,
  Button,
  Card,
  ConfirmAction,
  EmptyState,
  Field,
  Input,
  LoadMore,
  Select,
  Textarea,
  formatDate,
  formatMoney,
} from "@vsolve/ui";
import { Phone, Truck, Warehouse } from "lucide-react";
import { useState } from "react";

import { useDebounced } from "@/features/shared/use-debounced";

import {
  RENTAL_STATUS_LABEL,
  RENTAL_STATUS_TONE,
  TRANSPORT_STATUS_LABEL,
  addressLine,
  canCancelRental,
} from "./model/bookings";
import { cancelOpsRentalBooking, fetchOpsRentalBookingsPage, type OpsRentalBooking } from "./queries";

const STATUS_FILTERS = ["", ...Object.keys(RENTAL_STATUS_LABEL)];

function day(iso: string | null | undefined): string {
  return iso ? formatDate(`${iso}T12:00:00`) : "—";
}

/**
 * Every rental booking, newest first: who rented what from whom, how it reaches the customer,
 * and what was paid. Operations can cancel before handover; the server refunds in full.
 */
export function RentalBookings() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [cancelling, setCancelling] = useState<OpsRentalBooking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const q = useDebounced(search.trim());
  const bookings = usePagedList(["ops-rental-bookings", status, q], (cursor) =>
    fetchOpsRentalBookingsPage(cursor, { status: status || undefined, q: q || undefined }),
  );
  const rows = bookings.items;

  const cancel = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) => cancelOpsRentalBooking(id, note),
    onSuccess: () => {
      setCancelling(null);
      void qc.invalidateQueries({ queryKey: ["ops-rental-bookings"] });
    },
    onError: (err: unknown) => setError(friendlyErrorMessage(err)),
  });

  return (
    <section className="flex flex-col gap-4">
      <p className="text-sm text-text-secondary">
        Newest first. Search covers every booking, not just the ones on screen. Use the status to
        find delivery requests waiting on an owner, or payments that never finished.
      </p>
      <div className="grid gap-3 sm:grid-cols-[1fr_16rem]">
        <Field label="Search">
          <Input
            value={search}
            placeholder="Customer, phone, owner, equipment or booking id"
            onChange={(event) => setSearch(event.target.value)}
          />
        </Field>
        <Field label="Status">
          <Select value={status} onChange={(event) => setStatus(event.target.value)}>
            {STATUS_FILTERS.map((value) => (
              <option key={value || "all"} value={value}>
                {value ? RENTAL_STATUS_LABEL[value] : "All bookings"}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {bookings.isLoading ? <p className="text-sm text-text-secondary">Loading…</p> : null}
      {bookings.error ? (
        <p className="text-sm text-danger-text">{friendlyErrorMessage(bookings.error)}</p>
      ) : null}
      {!bookings.isLoading && rows.length === 0 ? (
        <EmptyState title="No bookings" description="Rental bookings matching this filter appear here." />
      ) : null}

      <ul className="flex flex-col gap-3">
        {rows.map((row) => {
          const delivery = row.pickup_or_delivery_mode === "DELIVERY";
          const transport = row.transport;
          return (
            <li key={row.id}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-navy-900">{row.asset?.title ?? "Rental"}</p>
                    <p className="text-sm text-text-secondary">
                      {day(row.start_date)} – {day(row.end_date)} · Qty {row.quantity ?? 1}
                    </p>
                  </div>
                  <Badge tone={RENTAL_STATUS_TONE[row.status ?? ""] ?? "neutral"}>
                    {RENTAL_STATUS_LABEL[row.status ?? ""] ?? row.status}
                  </Badge>
                </div>

                <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-xs font-semibold uppercase text-text-muted">Customer</dt>
                    <dd className="text-navy-900">{row.customer_name || "—"}</dd>
                    {row.customer_phone ? (
                      <dd>
                        <a className="inline-flex items-center gap-1 text-text-link" href={`tel:${row.customer_phone}`}>
                          <Phone className="size-3" /> {row.customer_phone}
                        </a>
                      </dd>
                    ) : null}
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase text-text-muted">Owner</dt>
                    <dd className="text-navy-900">{row.partner_name || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase text-text-muted">Customer pays</dt>
                    <dd className="text-navy-900">{formatMoney(row.amount_due_paise ?? 0)}</dd>
                    <dd className="text-xs text-text-secondary">
                      Rent {formatMoney(row.price_paise ?? 0)} · Deposit{" "}
                      {formatMoney(row.deposit?.amount_paise ?? 0)}
                      {row.transport_paise ? ` · Delivery ${formatMoney(row.transport_paise)}` : ""}
                    </dd>
                  </div>
                </dl>

                <div className="mt-3 flex items-start gap-2 rounded-card bg-surface-sunken p-2 text-sm">
                  {delivery ? <Truck className="mt-0.5 size-4 shrink-0" /> : <Warehouse className="mt-0.5 size-4 shrink-0" />}
                  <div>
                    <p className="font-medium text-navy-900">
                      {delivery ? "Owner delivers" : "Customer picks up"}
                    </p>
                    {delivery ? (
                      <p className="text-text-secondary">
                        {addressLine(row.delivery_address) || "No address"}
                        {transport?.status ? ` · ${TRANSPORT_STATUS_LABEL[transport.status] ?? transport.status}` : ""}
                        {typeof transport?.quote_paise === "number" ? ` · ${formatMoney(transport.quote_paise)}` : ""}
                      </p>
                    ) : null}
                  </div>
                </div>

                {row.cancellation_reason ? (
                  <p className="mt-2 text-sm text-text-secondary">Cancelled: {row.cancellation_reason}</p>
                ) : null}

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-text-muted">Booking {row.id}</p>
                  {canCancelRental(row.status) ? (
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => {
                        setError(null);
                        setReason("");
                        cancel.reset();
                        setCancelling(row);
                      }}
                    >
                      Cancel booking
                    </Button>
                  ) : null}
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
      <LoadMore hasMore={bookings.hasMore} loading={bookings.loadingMore} onLoadMore={bookings.loadMore} />

      <ConfirmAction
        open={cancelling !== null}
        onOpenChange={(open) => (open ? null : setCancelling(null))}
        title="Cancel this rental booking"
        consequence={
          <>
            The booking is cancelled and the equipment is free again. Anything the customer paid
            — rent, deposit and delivery — is refunded in full. This cannot be undone.
          </>
        }
        confirmLabel="Cancel and refund"
        destructive
        pending={cancel.isPending}
        onConfirm={() => {
          if (!reason.trim()) return setError("Write why, so the customer and owner can be told.");
          if (cancelling) cancel.mutate({ id: cancelling.id, note: reason.trim() });
        }}
      >
        <Field label="Reason" required>
          <Textarea value={reason} maxLength={480} onChange={(event) => setReason(event.target.value)} />
        </Field>
        {error ? (
          <p role="alert" className="text-sm text-danger-text">
            {error}
          </p>
        ) : null}
      </ConfirmAction>
    </section>
  );
}
