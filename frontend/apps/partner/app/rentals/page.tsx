"use client";

import { useQuery } from "@tanstack/react-query";

import { PartnerShell } from "@/features/session/partner-shell";
import { PUBLIC_API_BASE_URL } from "@/lib/api/config";

type Asset = {
  id: string;
  title: string;
  public_state: string;
  moderation_status: string;
  daily_rate_paise: number;
};

type Booking = {
  id: string;
  status: string;
  start_date: string;
  end_date: string;
  asset: { title: string };
  deposit: { status: string };
};

async function load() {
  const [assetsRes, bookingsRes] = await Promise.all([
    fetch(`${PUBLIC_API_BASE_URL}/api/v1/partner/rentals/assets`, { credentials: "include" }),
    fetch(`${PUBLIC_API_BASE_URL}/api/v1/partner/rentals/bookings`, { credentials: "include" }),
  ]);
  if (!assetsRes.ok || !bookingsRes.ok) {
    throw new Error("Could not load rental workspace.");
  }
  return {
    assets: (await assetsRes.json()) as Asset[],
    bookings: (await bookingsRes.json()) as Booking[],
  };
}

function PartnerRentalsInner() {
  const { data, isLoading, error } = useQuery({ queryKey: ["partner-rentals"], queryFn: load });

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
      <h1 className="text-xl font-bold">Rentals</h1>
      {isLoading ? <p className="text-sm">Loading…</p> : null}
      {error ? <p className="text-sm text-signal-700">{(error as Error).message}</p> : null}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-text-secondary">
          Assets
        </h2>
        <ul className="flex flex-col gap-2">
          {(data?.assets ?? []).map((asset) => (
            <li key={asset.id} className="rounded-lg border border-line p-3 text-sm">
              {asset.title} · {asset.public_state || asset.moderation_status}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-text-secondary">
          Bookings
        </h2>
        <ul className="flex flex-col gap-2">
          {(data?.bookings ?? []).map((booking) => (
            <li key={booking.id} className="rounded-lg border border-line p-3 text-sm">
              {booking.asset.title} · {booking.status} · deposit {booking.deposit.status}
              <br />
              {booking.start_date} → {booking.end_date}
            </li>
          ))}
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
