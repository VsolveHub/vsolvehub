"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { PUBLIC_API_BASE_URL } from "@/lib/api/config";

type RentalAsset = {
  id: string;
  title: string;
  description: string;
  daily_rate_paise: number;
  deposit_paise: number;
  location_text: string;
  partner_name: string;
};

async function fetchAsset(id: string): Promise<RentalAsset> {
  const res = await fetch(`${PUBLIC_API_BASE_URL}/api/v1/rentals/${id}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Asset not found or not public.");
  return (await res.json()) as RentalAsset;
}

function csrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|; )csrftoken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

export default function RentalDetailPage() {
  const params = useParams<{ assetId: string }>();
  const router = useRouter();
  const assetId = params.assetId;
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["rental", assetId],
    queryFn: () => fetchAsset(assetId),
    enabled: Boolean(assetId),
  });

  const book = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${PUBLIC_API_BASE_URL}/api/v1/rentals/book`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": csrfToken(),
        },
        body: JSON.stringify({
          asset_id: assetId,
          start_date: startDate,
          end_date: endDate,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { detail?: string };
      if (!res.ok) throw new Error(body.detail ?? "Booking failed.");
      return body;
    },
    onSuccess: () => router.push("/rentals/mine"),
    onError: (err: Error) => setError(err.message),
  });

  if (isLoading) return <main className="p-8 text-sm">Loading…</main>;
  if (!data) return <main className="p-8 text-sm">Asset not available.</main>;

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-8">
      <Link href="/rentals" className="text-sm font-semibold text-action">
        ← Rentals
      </Link>
      <h1 className="text-2xl font-bold">{data.title}</h1>
      <p className="text-sm text-text-secondary">{data.description}</p>
      <p className="text-sm">
        {data.partner_name} · {data.location_text}
      </p>
      <form
        className="flex flex-col gap-3 rounded-xl border border-line p-4"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          book.mutate();
        }}
      >
        <label className="text-sm">
          Start
          <input
            type="date"
            required
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="mt-1 w-full rounded border border-line px-3 py-2"
          />
        </label>
        <label className="text-sm">
          End
          <input
            type="date"
            required
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="mt-1 w-full rounded border border-line px-3 py-2"
          />
        </label>
        {error ? <p className="text-sm text-signal-700">{error}</p> : null}
        <button
          type="submit"
          disabled={book.isPending}
          className="rounded-lg bg-action px-4 py-2 text-sm font-semibold text-action-text"
        >
          {book.isPending ? "Booking…" : "Book rental"}
        </button>
        <p className="text-xs text-text-secondary">
          Deposit hold may be PARTIAL (demo/test provider) until Part B live payments.
        </p>
      </form>
    </main>
  );
}
