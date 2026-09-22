"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { OperationsShell } from "@/features/session/operations-shell";
import { PUBLIC_API_BASE_URL } from "@/lib/api/config";

type Asset = {
  id: string;
  title: string;
  moderation_status: string;
  public_state: string;
  partner_name: string;
};

function csrfToken(): string {
  if (typeof document === "undefined") return "";
  const token = document.cookie.match(/(?:^|; )csrftoken=([^;]+)/)?.[1];
  return token ? decodeURIComponent(token) : "";
}

function OpsRentalsInner() {
  const qc = useQueryClient();
  const [reason, setReason] = useState("Ops review complete.");
  const { data = [], isLoading, error } = useQuery({
    queryKey: ["ops-rentals"],
    queryFn: async () => {
      const res = await fetch(`${PUBLIC_API_BASE_URL}/api/v1/ops/rentals`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Could not load rental queue.");
      return (await res.json()) as Asset[];
    },
  });

  const moderate = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: string }) => {
      const res = await fetch(`${PUBLIC_API_BASE_URL}/api/v1/ops/rentals/${id}/moderate`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": csrfToken(),
        },
        body: JSON.stringify({ action, reason }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { detail?: string };
        throw new Error(body.detail ?? "Moderate failed.");
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["ops-rentals"] }),
  });

  const pending = data.filter((row) => row.moderation_status === "PENDING");

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-6">
      <h1 className="text-xl font-bold">Rental assets</h1>
      <label className="text-sm">
        Reason (required)
        <input
          className="mt-1 w-full rounded border border-line px-3 py-2"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      {isLoading ? <p className="text-sm">Loading…</p> : null}
      {error ? <p className="text-sm text-red-700">{(error as Error).message}</p> : null}
      <p className="text-sm text-text-secondary">{pending.length} pending</p>
      <ul className="flex flex-col gap-2">
        {data.map((asset) => (
          <li key={asset.id} className="rounded-lg border border-line p-3 text-sm">
            <p className="font-semibold">
              {asset.title} · {asset.public_state}
            </p>
            <p className="text-text-secondary">{asset.partner_name}</p>
            {asset.moderation_status === "PENDING" ? (
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  className="rounded bg-emerald-700 px-3 py-1 text-xs text-white"
                  onClick={() => moderate.mutate({ id: asset.id, action: "APPROVE" })}
                >
                  Approve
                </button>
                <button
                  type="button"
                  className="rounded bg-red-700 px-3 py-1 text-xs text-white"
                  onClick={() => moderate.mutate({ id: asset.id, action: "REJECT" })}
                >
                  Reject
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </main>
  );
}

export default function OpsRentalsPage() {
  return (
    <OperationsShell>
      <OpsRentalsInner />
    </OperationsShell>
  );
}
