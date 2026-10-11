"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { friendlyErrorMessage } from "@vsolve/query";
import {
  Badge,
  Button,
  Card,
  ConfirmAction,
  EmptyState,
  Field,
  Input,
  Select,
  Textarea,
  formatDate,
  formatMoney,
} from "@vsolve/ui";
import { Phone } from "lucide-react";
import { useMemo, useState } from "react";

import { STAY_STATUS_LABEL, canCancelStay, matchesSearch } from "./model/bookings";
import {
  cancelOpsStayReservation,
  fetchOpsStayEnquiries,
  fetchOpsStayReservations,
  type OpsStayReservation,
} from "./queries";

function day(iso: string | null | undefined): string {
  return iso ? formatDate(`${iso}T12:00:00`) : "—";
}

const STAY_TONE: Record<string, "warning" | "info" | "success" | "neutral" | "danger"> = {
  HELD: "warning",
  PAYMENT_PENDING: "warning",
  CONFIRMED: "info",
  CHECKED_IN: "info",
  CHECKED_OUT: "success",
  CANCELLED: "neutral",
  NO_SHOW: "danger",
};

/** Guest reservations, with a full-refund cancel before check-in. */
export function StayReservations() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [cancelling, setCancelling] = useState<OpsStayReservation | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const reservations = useQuery({
    queryKey: ["ops-stays-reservations"],
    queryFn: fetchOpsStayReservations,
  });

  const rows = useMemo(
    () =>
      [...(reservations.data ?? [])]
        .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
        .filter((row) => !status || row.status === status)
        .filter((row) =>
          matchesSearch(search, [
            row.id,
            row.property_title,
            row.unit_name,
            row.customer_name,
            row.customer_phone,
          ]),
        ),
    [reservations.data, search, status],
  );

  const cancel = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) => cancelOpsStayReservation(id, note),
    onSuccess: () => {
      setCancelling(null);
      void qc.invalidateQueries({ queryKey: ["ops-stays-reservations"] });
    },
    onError: (err: unknown) => setError(friendlyErrorMessage(err)),
  });

  return (
    <section className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_14rem]">
        <Field label="Search">
          <Input
            value={search}
            placeholder="Guest, phone, property or reservation id"
            onChange={(event) => setSearch(event.target.value)}
          />
        </Field>
        <Field label="Status">
          <Select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">All reservations</option>
            {Object.entries(STAY_STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {reservations.isLoading ? <p className="text-sm text-text-secondary">Loading…</p> : null}
      {reservations.error ? (
        <p className="text-sm text-danger-text">{friendlyErrorMessage(reservations.error)}</p>
      ) : null}
      {!reservations.isLoading && rows.length === 0 ? (
        <EmptyState title="No reservations" description="Hotel and short-stay bookings show up here." />
      ) : null}

      <ul className="flex flex-col gap-3">
        {rows.map((row) => (
          <li key={row.id}>
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-navy-900">
                    {row.property_title ?? "Stay"} · {row.unit_name ?? "Room"}
                  </p>
                  <p className="text-sm text-text-secondary">
                    {day(row.check_in)} – {day(row.check_out)} · {row.nights ?? "?"} night
                    {row.nights === 1 ? "" : "s"} · {row.guest_count ?? 1} guest
                    {row.guest_count === 1 ? "" : "s"}
                    {typeof row.total_paise === "number" ? ` · ${formatMoney(row.total_paise)}` : ""}
                  </p>
                </div>
                <Badge tone={STAY_TONE[row.status ?? ""] ?? "neutral"}>
                  {STAY_STATUS_LABEL[row.status ?? ""] ?? row.status}
                </Badge>
              </div>
              <p className="mt-2 text-sm text-text-secondary">
                Guest: {row.customer_name || "—"}
                {row.customer_phone ? (
                  <a className="ml-2 inline-flex items-center gap-1 text-text-link" href={`tel:${row.customer_phone}`}>
                    <Phone className="size-3" /> {row.customer_phone}
                  </a>
                ) : null}
              </p>
              {row.cancellation_reason ? (
                <p className="mt-1 text-sm text-text-secondary">Cancelled: {row.cancellation_reason}</p>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-text-muted">Reservation {row.id}</p>
                {canCancelStay(row.status) ? (
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => {
                      setReason("");
                      setError(null);
                      cancel.reset();
                      setCancelling(row);
                    }}
                  >
                    Cancel reservation
                  </Button>
                ) : null}
              </div>
            </Card>
          </li>
        ))}
      </ul>

      <ConfirmAction
        open={cancelling !== null}
        onOpenChange={(open) => (open ? null : setCancelling(null))}
        title="Cancel this reservation"
        consequence="The room is released and the guest is refunded in full. This cannot be undone."
        confirmLabel="Cancel and refund"
        destructive
        pending={cancel.isPending}
        onConfirm={() => {
          if (!reason.trim()) return setError("Write why, so the guest and host can be told.");
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

/** Guest questions to hosts. Read-only: hosts answer them. */
export function StayEnquiries() {
  const enquiries = useQuery({ queryKey: ["ops-stays-enquiries"], queryFn: fetchOpsStayEnquiries });
  return (
    <section className="flex flex-col gap-3">
      <p className="text-sm text-text-secondary">
        Hosts answer these. Look here when a guest says nobody replied.
      </p>
      {enquiries.isLoading ? <p className="text-sm text-text-secondary">Loading…</p> : null}
      {enquiries.error ? (
        <p className="text-sm text-danger-text">{friendlyErrorMessage(enquiries.error)}</p>
      ) : null}
      {enquiries.data && enquiries.data.length === 0 ? (
        <EmptyState title="No enquiries" description="Guest questions show up here." />
      ) : null}
      <ul className="flex flex-col gap-3">
        {enquiries.data?.map((enquiry) => (
          <li key={enquiry.id}>
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="font-semibold text-navy-900">
                  {enquiry.property_title} · {enquiry.unit_name}
                </p>
                <Badge tone={enquiry.host_response ? "success" : "warning"}>
                  {enquiry.host_response ? "Host replied" : "Waiting for host"}
                </Badge>
              </div>
              <p className="text-sm text-text-secondary">
                {day(enquiry.check_in)} – {day(enquiry.check_out)} · {enquiry.guest_count || 1} guest
                {typeof enquiry.total_quote_paise === "number"
                  ? ` · ${formatMoney(enquiry.total_quote_paise)}`
                  : ""}
              </p>
              {enquiry.message ? <p className="mt-2 text-sm">“{enquiry.message}”</p> : null}
              {enquiry.host_response ? (
                <p className="mt-2 text-sm text-text-secondary">Host: {enquiry.host_response}</p>
              ) : null}
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
