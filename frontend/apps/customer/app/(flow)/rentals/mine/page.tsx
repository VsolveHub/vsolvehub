"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { PUBLIC_API_BASE_URL } from "@/lib/api/config";

type Booking = {
  id: string;
  status: string;
  start_date: string;
  end_date: string;
  price_paise: number;
  asset: { title: string };
  deposit: { status: string; amount_paise: number; provider_note: string };
};

async function fetchMine(): Promise<Booking[]> {
  const res = await fetch(`${PUBLIC_API_BASE_URL}/api/v1/me/rentals`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Sign in as a customer to see your rentals.");
  return (await res.json()) as Booking[];
}

export default function MyRentalsPage() {
  const { data = [], isLoading, error } = useQuery({
    queryKey: ["my-rentals"],
    queryFn: fetchMine,
  });

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-8">
      <Link href="/rentals" className="text-sm font-semibold text-action">
        ← Rentals
      </Link>
      <h1 className="text-2xl font-bold">My rentals</h1>
      {isLoading ? <p className="text-sm">Loading…</p> : null}
      {error ? <p className="text-sm text-signal-700">{(error as Error).message}</p> : null}
      <ul className="flex flex-col gap-3">
        {data.map((row) => (
          <li key={row.id} className="rounded-xl border border-line p-4 text-sm">
            <p className="font-semibold">{row.asset.title}</p>
            <p>
              {row.start_date} → {row.end_date} · {row.status}
            </p>
            <p>
              Deposit {row.deposit.status} ({row.deposit.amount_paise} paise)
            </p>
            {row.deposit.provider_note ? (
              <p className="text-xs text-text-secondary">{row.deposit.provider_note}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </main>
  );
}
