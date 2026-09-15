"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { PUBLIC_API_BASE_URL } from "@/lib/api/config";

type StayProperty = {
  id: string;
  title: string;
  description: string;
  location_text: string;
  host_name: string;
  units: { id: string; name: string; nightly_rate_paise: number }[];
};

async function fetchProperty(id: string): Promise<StayProperty> {
  const res = await fetch(`${PUBLIC_API_BASE_URL}/api/v1/stays/${id}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Property not available.");
  return (await res.json()) as StayProperty;
}

function csrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|; )csrftoken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

export default function StayDetailPage() {
  const params = useParams<{ propertyId: string }>();
  const router = useRouter();
  const propertyId = params.propertyId;
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["stay", propertyId],
    queryFn: () => fetchProperty(propertyId),
    enabled: Boolean(propertyId),
  });

  const enquire = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${PUBLIC_API_BASE_URL}/api/v1/stays/enquire`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": csrfToken(),
        },
        body: JSON.stringify({
          property_id: propertyId,
          unit_id: data?.units[0]?.id ?? null,
          check_in: checkIn,
          check_out: checkOut,
          message,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { detail?: string };
      if (!res.ok) throw new Error(body.detail ?? "Enquiry failed.");
      return body;
    },
    onSuccess: () => router.push("/stays/mine"),
    onError: (err: Error) => setError(err.message),
  });

  if (isLoading) return <main className="p-8 text-sm">Loading…</main>;
  if (!data) return <main className="p-8 text-sm">Property not available.</main>;

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-8">
      <Link href="/stays" className="text-sm font-semibold text-action">
        ← Stays
      </Link>
      <h1 className="text-2xl font-bold">{data.title}</h1>
      <p className="text-sm text-text-secondary">{data.description}</p>
      <form
        className="flex flex-col gap-3 rounded-xl border border-line p-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          enquire.mutate();
        }}
      >
        <label className="text-sm">
          Check-in
          <input
            type="date"
            required
            value={checkIn}
            onChange={(e) => setCheckIn(e.target.value)}
            className="mt-1 w-full rounded border border-line px-3 py-2"
          />
        </label>
        <label className="text-sm">
          Check-out
          <input
            type="date"
            required
            value={checkOut}
            onChange={(e) => setCheckOut(e.target.value)}
            className="mt-1 w-full rounded border border-line px-3 py-2"
          />
        </label>
        <label className="text-sm">
          Message
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="mt-1 w-full rounded border border-line px-3 py-2"
            rows={3}
          />
        </label>
        {error ? <p className="text-sm text-signal-700">{error}</p> : null}
        <button
          type="submit"
          disabled={enquire.isPending}
          className="rounded-lg bg-action px-4 py-2 text-sm font-semibold text-action-text"
        >
          {enquire.isPending ? "Sending…" : "Send enquiry"}
        </button>
      </form>
    </main>
  );
}
