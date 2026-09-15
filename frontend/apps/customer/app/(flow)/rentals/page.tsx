"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { PUBLIC_API_BASE_URL } from "@/lib/api/config";

type RentalAsset = {
  id: string;
  title: string;
  description: string;
  location_text: string;
  daily_rate_paise: number;
  deposit_paise: number;
  public_state: string;
  partner_name: string;
};

async function fetchRentals(): Promise<RentalAsset[]> {
  const res = await fetch(`${PUBLIC_API_BASE_URL}/api/v1/rentals`, {
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error("Could not load rentals.");
  }
  return (await res.json()) as RentalAsset[];
}

function formatPaise(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

export default function RentalsBrowsePage() {
  const { data = [], isLoading, error } = useQuery({
    queryKey: ["rentals"],
    queryFn: fetchRentals,
  });

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text">Rentals</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Temporary possession of tools and equipment. Not a visit booking.
          </p>
        </div>
        <Link href="/rentals/mine" className="text-sm font-semibold text-action underline">
          My rentals
        </Link>
      </header>

      {isLoading ? <p className="text-sm text-text-secondary">Loading…</p> : null}
      {error ? (
        <p className="text-sm text-signal-700">Could not load rentals from the server.</p>
      ) : null}
      {!isLoading && !error && data.length === 0 ? (
        <p className="text-sm text-text-secondary">No published rental assets yet.</p>
      ) : null}

      <ul className="flex flex-col gap-3">
        {data.map((asset) => (
          <li key={asset.id} className="rounded-xl border border-line bg-surface p-4">
            <Link href={`/rentals/${asset.id}`} className="block space-y-1">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-semibold text-text">{asset.title}</h2>
                <span className="text-sm font-bold text-text">
                  {formatPaise(asset.daily_rate_paise)}/day
                </span>
              </div>
              <p className="text-sm text-text-secondary">{asset.partner_name}</p>
              <p className="text-sm text-text-secondary">{asset.location_text}</p>
              <p className="text-xs text-text-secondary">
                Deposit {formatPaise(asset.deposit_paise)} · {asset.public_state}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
