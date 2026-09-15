"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { OperationsShell } from "@/features/session/operations-shell";
import { PUBLIC_API_BASE_URL } from "@/lib/api/config";

type Property = {
  id: string;
  title: string;
  moderation_status: string;
  public_state: string;
  host_name: string;
};

function csrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|; )csrftoken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

function OpsStaysInner() {
  const qc = useQueryClient();
  const [reason, setReason] = useState("Ops review complete.");
  const { data = [], isLoading, error } = useQuery({
    queryKey: ["ops-stays"],
    queryFn: async () => {
      const res = await fetch(`${PUBLIC_API_BASE_URL}/api/v1/ops/stays`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Could not load stay queue.");
      return (await res.json()) as Property[];
    },
  });

  const moderate = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: string }) => {
      const res = await fetch(`${PUBLIC_API_BASE_URL}/api/v1/ops/stays/${id}/moderate`, {
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
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["ops-stays"] }),
  });

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-6">
      <h1 className="text-xl font-bold">Stay properties</h1>
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
      <ul className="flex flex-col gap-2">
        {data.map((prop) => (
          <li key={prop.id} className="rounded-lg border border-line p-3 text-sm">
            <p className="font-semibold">
              {prop.title} · {prop.public_state}
            </p>
            <p className="text-text-secondary">{prop.host_name}</p>
            {prop.moderation_status === "PENDING" ? (
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  className="rounded bg-emerald-700 px-3 py-1 text-xs text-white"
                  onClick={() => moderate.mutate({ id: prop.id, action: "APPROVE" })}
                >
                  Approve
                </button>
                <button
                  type="button"
                  className="rounded bg-red-700 px-3 py-1 text-xs text-white"
                  onClick={() => moderate.mutate({ id: prop.id, action: "REJECT" })}
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

export default function OpsStaysPage() {
  return (
    <OperationsShell>
      <OpsStaysInner />
    </OperationsShell>
  );
}
