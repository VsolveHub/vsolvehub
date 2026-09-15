"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { PUBLIC_API_BASE_URL } from "@/lib/api/config";

type Enquiry = {
  id: string;
  property_title: string;
  status: string;
  check_in: string;
  check_out: string;
  host_response: string;
};

async function fetchMine(): Promise<Enquiry[]> {
  const res = await fetch(`${PUBLIC_API_BASE_URL}/api/v1/me/stay-enquiries`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Sign in as a customer to see enquiries.");
  return (await res.json()) as Enquiry[];
}

export default function MyStayEnquiriesPage() {
  const { data = [], isLoading, error } = useQuery({
    queryKey: ["my-stay-enquiries"],
    queryFn: fetchMine,
  });

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-8">
      <Link href="/stays" className="text-sm font-semibold text-action">
        ← Stays
      </Link>
      <h1 className="text-2xl font-bold">My stay enquiries</h1>
      {isLoading ? <p className="text-sm">Loading…</p> : null}
      {error ? <p className="text-sm text-signal-700">{(error as Error).message}</p> : null}
      <ul className="flex flex-col gap-3">
        {data.map((row) => (
          <li key={row.id} className="rounded-xl border border-line p-4 text-sm">
            <p className="font-semibold">{row.property_title}</p>
            <p>
              {row.check_in} → {row.check_out} · {row.status}
            </p>
            {row.host_response ? <p className="mt-2">{row.host_response}</p> : null}
          </li>
        ))}
      </ul>
    </main>
  );
}
