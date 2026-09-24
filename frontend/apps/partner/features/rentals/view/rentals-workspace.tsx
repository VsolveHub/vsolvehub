"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Card, EmptyState, Field, Input, Select, formatMoney } from "@vsolve/ui";
import { useState, type FormEvent } from "react";

import { usePartnerCapabilities } from "@/features/capability/queries";
import {
  bookingActionLabel,
  canSubmitAsset,
  partnerBookingAction,
  type BookingAction,
} from "@/features/rentals/booking-actions";
import {
  createPartnerRentalAsset,
  fetchPartnerRentalAssets,
  fetchPartnerRentalBookings,
  partnerRentalBookingAction,
  rentalVariantChoices,
  submitPartnerRentalAsset,
} from "@/features/rentals/queries";

export function PartnerRentalsWorkspace() {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [variantId, setVariantId] = useState("");
  const [dailyRate, setDailyRate] = useState("");
  const [deposit, setDeposit] = useState("");
  const [location, setLocation] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const capabilities = usePartnerCapabilities();
  const variants = rentalVariantChoices(capabilities.data?.capabilities);
  const assets = useQuery({
    queryKey: ["partner-rentals", "assets"],
    queryFn: fetchPartnerRentalAssets,
  });
  const bookings = useQuery({
    queryKey: ["partner-rentals", "bookings"],
    queryFn: fetchPartnerRentalBookings,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["partner-rentals"] });
  };

  const create = useMutation({
    mutationFn: createPartnerRentalAsset,
    onSuccess: () => {
      setTitle("");
      setVariantId("");
      setDailyRate("");
      setDeposit("");
      setLocation("");
      setFormError(null);
      invalidate();
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const act = useMutation({
    mutationFn: async (
      input: { kind: "submit"; id: string } | { kind: "booking"; id: string; action: BookingAction },
    ) => {
      if (input.kind === "submit") return submitPartnerRentalAsset(input.id);
      return partnerRentalBookingAction(input.id, input.action);
    },
    onSuccess: invalidate,
  });

  function onCreate(event: FormEvent) {
    event.preventDefault();
    const daily = Number(dailyRate);
    const depositPaise = Number(deposit);
    if (!variantId || !title.trim() || !Number.isInteger(daily) || daily < 1) {
      setFormError("Choose a variant, a title, and a daily rate in paise.");
      return;
    }
    if (deposit.trim() !== "" && (!Number.isInteger(depositPaise) || depositPaise < 0)) {
      setFormError("Deposit must be a whole number of paise.");
      return;
    }
    setFormError(null);
    create.mutate({
      variant_id: variantId,
      title: title.trim(),
      description: "",
      location_text: location.trim(),
      daily_rate_paise: daily,
      deposit_paise: deposit.trim() === "" ? 0 : depositPaise,
      asset_identifier: "",
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
      <h1 className="text-xl font-bold text-navy-900">Rentals</h1>
      <Card>
        <form className="flex flex-col gap-3" onSubmit={onCreate}>
          <h2 className="text-base font-semibold text-navy-900">Create asset</h2>
          <Field label="Title">
            <Input id="rental-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Variant">
            <Select
              id="rental-variant"
              value={variantId}
              onChange={(e) => setVariantId(e.target.value)}
            >
              <option value="">Select a variant</option>
              {variants.map((variant) => (
                <option key={variant.id} value={variant.id}>
                  {variant.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Daily rate (paise)">
            <Input
              id="rental-rate"
              inputMode="numeric"
              value={dailyRate}
              onChange={(e) => setDailyRate(e.target.value)}
            />
          </Field>
          <Field label="Deposit (paise)">
            <Input
              id="rental-deposit"
              inputMode="numeric"
              value={deposit}
              onChange={(e) => setDeposit(e.target.value)}
            />
          </Field>
          <Field label="Location">
            <Input
              id="rental-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </Field>
          {formError ? <p className="text-sm text-danger-text">{formError}</p> : null}
          <Button type="submit" disabled={create.isPending}>
            Create asset
          </Button>
        </form>
      </Card>

      <Card>
        <h2 className="mb-3 text-base font-semibold text-navy-900">Assets</h2>
        {assets.isLoading ? <p className="text-sm text-text-secondary">Loading…</p> : null}
        {assets.error ? (
          <p className="text-sm text-danger-text">{(assets.error as Error).message}</p>
        ) : null}
        {assets.data && assets.data.length === 0 ? (
          <EmptyState compact title="No assets yet" description="Create an asset to list it for review." />
        ) : null}
        <ul className="flex flex-col gap-3">
          {assets.data?.map((asset) => (
            <li key={asset.id} className="rounded-card border border-line p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-navy-900">{asset.title}</p>
                  <p className="text-sm text-text-secondary">
                    {formatMoney(asset.daily_rate_paise)} / day
                    {asset.location_text ? ` · ${asset.location_text}` : ""}
                  </p>
                </div>
                <Badge>{asset.public_state}</Badge>
              </div>
              {canSubmitAsset(asset.moderation_status) ? (
                <div className="mt-3">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={act.isPending}
                    onClick={() => act.mutate({ kind: "submit", id: asset.id })}
                  >
                    Submit for review
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2 className="mb-3 text-base font-semibold text-navy-900">Bookings</h2>
        {bookings.isLoading ? <p className="text-sm text-text-secondary">Loading…</p> : null}
        {bookings.error ? (
          <p className="text-sm text-danger-text">{(bookings.error as Error).message}</p>
        ) : null}
        {bookings.data && bookings.data.length === 0 ? (
          <EmptyState compact title="No bookings yet" description="Bookings appear here after a customer reserves an asset." />
        ) : null}
        <ul className="flex flex-col gap-3">
          {bookings.data?.map((booking) => {
            const action = partnerBookingAction(booking.status ?? "", booking.deposit?.status);
            return (
              <li key={booking.id} className="rounded-card border border-line p-3">
                <p className="font-semibold text-navy-900">{booking.asset.title}</p>
                <p className="text-sm text-text-secondary">
                  {booking.status} · {formatMoney(booking.price_paise)} · {booking.start_date} – {booking.end_date}
                </p>
                {action ? (
                  <div className="mt-3">
                    <Button
                      size="sm"
                      disabled={act.isPending}
                      onClick={() => act.mutate({ kind: "booking", id: booking.id, action })}
                    >
                      {bookingActionLabel(action)}
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
