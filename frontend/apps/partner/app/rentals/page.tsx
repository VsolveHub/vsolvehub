"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { PartnerShell } from "@/features/session/partner-shell";
import { usePartnerCapabilities } from "@/features/capability/queries";
import {
  bookingActionLabel,
  canSubmitAsset,
  partnerBookingAction,
} from "@/features/rentals/booking-actions";
import {
  createPartnerRentalAsset,
  fetchPartnerRentalAssets,
  fetchPartnerRentalBookings,
  partnerRentalBookingAction,
  rentalVariantChoices,
  submitPartnerRentalAsset,
} from "@/features/rentals/queries";

const QUERY_KEY = ["partner-rentals"] as const;

function formatPaise(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

function PartnerRentalsInner() {
  const qc = useQueryClient();
  const capabilities = usePartnerCapabilities();
  const variants = rentalVariantChoices(capabilities.data?.capabilities);
  const defaultVariantId = variants[0]?.id ?? "";

  const { data, isLoading, error } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const [assets, bookings] = await Promise.all([
        fetchPartnerRentalAssets(),
        fetchPartnerRentalBookings(),
      ]);
      return { assets, bookings };
    },
  });

  const [title, setTitle] = useState("");
  const [dailyRate, setDailyRate] = useState("49900");
  const [deposit, setDeposit] = useState("200000");
  const [location, setLocation] = useState("Hyderabad");
  const [variantId, setVariantId] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!variantId && defaultVariantId) {
      setVariantId(defaultVariantId);
    }
  }, [variantId, defaultVariantId]);

  const createAsset = useMutation({
    mutationFn: async () => {
      const daily = Number.parseInt(dailyRate, 10);
      const dep = Number.parseInt(deposit, 10);
      if (!title.trim()) throw new Error("Title is required.");
      if (!variantId) throw new Error("Select an approved rental variant.");
      if (!Number.isFinite(daily) || daily < 1) {
        throw new Error("Daily rate must be positive integer paise.");
      }
      if (!Number.isFinite(dep) || dep < 0) {
        throw new Error("Deposit must be non-negative integer paise.");
      }
      return createPartnerRentalAsset({
        variant_id: variantId,
        title: title.trim(),
        description: "",
        location_text: location.trim(),
        daily_rate_paise: daily,
        deposit_paise: dep,
        asset_identifier: "",
      });
    },
    onSuccess: () => {
      setTitle("");
      setFormError(null);
      void qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const submitAsset = useMutation({
    mutationFn: (assetId: string) => submitPartnerRentalAsset(assetId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  const bookingAction = useMutation({
    mutationFn: ({
      bookingId,
      action,
    }: {
      bookingId: string;
      action: "handover" | "return" | "release-deposit";
    }) => partnerRentalBookingAction(bookingId, action),
    onSuccess: () => void qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  const actionBusy = submitAsset.isPending || bookingAction.isPending;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
      <header>
        <h1 className="text-xl font-bold">Rentals</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Temporary possession assets — not visit bookings. Rates are integer paise.
        </p>
      </header>

      {isLoading ? <p className="text-sm">Loading…</p> : null}
      {error ? (
        <p className="text-sm text-signal-700">{(error as Error).message}</p>
      ) : null}

      <section className="rounded-lg border border-line p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-secondary">
          Create asset
        </h2>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            createAsset.mutate();
          }}
        >
          <label className="text-sm">
            Title
            <input
              className="mt-1 w-full rounded border border-line px-3 py-2"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Bosch Drill"
              required
            />
          </label>
          <label className="text-sm">
            Variant
            <select
              className="mt-1 w-full rounded border border-line px-3 py-2"
              value={variantId}
              onChange={(e) => setVariantId(e.target.value)}
              required
            >
              {variants.length === 0 ? (
                <option value="">No approved A7 variant</option>
              ) : (
                variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))
              )}
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Daily rate (paise)
              <input
                className="mt-1 w-full rounded border border-line px-3 py-2"
                inputMode="numeric"
                value={dailyRate}
                onChange={(e) => setDailyRate(e.target.value)}
                required
              />
            </label>
            <label className="text-sm">
              Deposit (paise)
              <input
                className="mt-1 w-full rounded border border-line px-3 py-2"
                inputMode="numeric"
                value={deposit}
                onChange={(e) => setDeposit(e.target.value)}
                required
              />
            </label>
          </div>
          <label className="text-sm">
            Location
            <input
              className="mt-1 w-full rounded border border-line px-3 py-2"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </label>
          {formError || createAsset.error ? (
            <p className="text-sm text-signal-700">
              {formError ?? (createAsset.error as Error).message}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={createAsset.isPending || variants.length === 0}
            className="self-start rounded bg-action px-3 py-1.5 text-xs font-semibold text-action-text disabled:opacity-50"
          >
            {createAsset.isPending ? "Creating…" : "Create asset"}
          </button>
        </form>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-text-secondary">
          Assets
        </h2>
        <ul className="flex flex-col gap-2">
          {(data?.assets ?? []).map((asset) => (
            <li key={asset.id} className="rounded-lg border border-line p-3 text-sm">
              <p className="font-semibold">
                {asset.title} · {asset.public_state || asset.moderation_status}
              </p>
              <p className="text-text-secondary">
                {formatPaise(asset.daily_rate_paise)}/day · deposit{" "}
                {formatPaise(asset.deposit_paise)}
              </p>
              {canSubmitAsset(asset.moderation_status) ? (
                <button
                  type="button"
                  disabled={actionBusy}
                  className="mt-2 rounded bg-action px-3 py-1.5 text-xs font-semibold text-action-text disabled:opacity-50"
                  onClick={() => submitAsset.mutate(asset.id)}
                >
                  Submit for review
                </button>
              ) : null}
              {submitAsset.isError && submitAsset.variables === asset.id ? (
                <p className="mt-1 text-xs text-signal-700">
                  {(submitAsset.error as Error).message}
                </p>
              ) : null}
            </li>
          ))}
          {!isLoading && (data?.assets ?? []).length === 0 ? (
            <li className="text-sm text-text-secondary">No assets yet.</li>
          ) : null}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-text-secondary">
          Bookings
        </h2>
        <ul className="flex flex-col gap-2">
          {(data?.bookings ?? []).map((booking) => {
            const deposit = booking.deposit;
            const action = partnerBookingAction(
              booking.status ?? "",
              deposit?.status ?? null,
            );
            const note = deposit?.provider_note?.trim();
            return (
              <li key={booking.id} className="rounded-lg border border-line p-3 text-sm">
                <p className="font-semibold">
                  {booking.asset.title} · {booking.status}
                </p>
                <p>
                  {booking.start_date} → {booking.end_date} ·{" "}
                  {formatPaise(booking.price_paise)}
                </p>
                <p className="text-text-secondary">
                  Deposit {deposit?.status ?? "—"}
                  {deposit?.amount_paise != null
                    ? ` · ${formatPaise(deposit.amount_paise)}`
                    : ""}
                </p>
                {note ? (
                  <p className="mt-1 text-xs text-amber-800">
                    PARTIAL: {note}
                  </p>
                ) : null}
                {action ? (
                  <button
                    type="button"
                    disabled={actionBusy}
                    className="mt-2 rounded bg-action px-3 py-1.5 text-xs font-semibold text-action-text disabled:opacity-50"
                    onClick={() =>
                      bookingAction.mutate({ bookingId: booking.id, action })
                    }
                  >
                    {bookingActionLabel(action)}
                  </button>
                ) : null}
                {bookingAction.isError &&
                bookingAction.variables?.bookingId === booking.id ? (
                  <p className="mt-1 text-xs text-signal-700">
                    {(bookingAction.error as Error).message}
                  </p>
                ) : null}
              </li>
            );
          })}
          {!isLoading && (data?.bookings ?? []).length === 0 ? (
            <li className="text-sm text-text-secondary">No bookings yet.</li>
          ) : null}
        </ul>
      </section>
    </main>
  );
}

export default function PartnerRentalsPage() {
  return (
    <PartnerShell requirePartnerRole>
      <PartnerRentalsInner />
    </PartnerShell>
  );
}
