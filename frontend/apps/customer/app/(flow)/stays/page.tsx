"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { PUBLIC_API_BASE_URL } from "@/lib/api/config";

type StayProperty = {
  id: string;
  title: string;
  description: string;
  location_text: string;
  host_name: string;
  public_state: string;
  units: { id: string; name: string; nightly_rate_paise: number }[];
};

async function fetchStays(): Promise<StayProperty[]> {
  const res = await fetch(`${PUBLIC_API_BASE_URL}/api/v1/stays`, { credentials: "include" });
  if (!res.ok) throw new Error("Could not load stays.");
  return (await res.json()) as StayProperty[];
}

export default function StaysBrowsePage() {
  const { data = [], isLoading, error } = useQuery({
    queryKey: ["stays"],
    queryFn: fetchStays,
  });

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Stays</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Enquiry-first rooms / PG / hostel. Not a visit booking.
          </p>
        </div>
        <Link href="/stays/mine" className="text-sm font-semibold text-action underline">
          My enquiries
        </Link>
      </header>
      {isLoading ? <p className="text-sm">Loading…</p> : null}
      {error ? <p className="text-sm text-signal-700">Could not load stays.</p> : null}
      {!isLoading && data.length === 0 ? (
        <p className="text-sm text-text-secondary">No published properties yet.</p>
      ) : null}
      <ul className="flex flex-col gap-3">
        {data.map((prop) => (
          <li key={prop.id} className="rounded-xl border border-line p-4">
            <Link href={`/stays/${prop.id}`} className="block space-y-1">
              <h2 className="text-lg font-semibold">{prop.title}</h2>
              <p className="text-sm text-text-secondary">
                {prop.host_name} · {prop.location_text}
              </p>
              <p className="text-xs text-text-secondary">
                From ₹
                {((prop.units[0]?.nightly_rate_paise ?? 0) / 100).toLocaleString("en-IN")}/night
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
