"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { PartnerShell } from "@/features/session/partner-shell";
import { PUBLIC_API_BASE_URL } from "@/lib/api/config";

type Property = {
  id: string;
  title: string;
  public_state: string;
  moderation_status: string;
};

type Enquiry = {
  id: string;
  property_title: string;
  status: string;
  check_in: string;
  check_out: string;
  message: string;
};

function csrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|; )csrftoken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

async function load() {
  const [propsRes, enqRes] = await Promise.all([
    fetch(`${PUBLIC_API_BASE_URL}/api/v1/partner/stays/properties`, { credentials: "include" }),
    fetch(`${PUBLIC_API_BASE_URL}/api/v1/partner/stays/enquiries`, { credentials: "include" }),
  ]);
  if (!propsRes.ok || !enqRes.ok) throw new Error("Could not load stay workspace.");
  return {
    properties: (await propsRes.json()) as Property[],
    enquiries: (await enqRes.json()) as Enquiry[],
  };
}

function PartnerStaysInner() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["partner-stays"], queryFn: load });
  const [response, setResponse] = useState("Yes, available for those dates.");

  const respond = useMutation({
    mutationFn: async (enquiryId: string) => {
      const res = await fetch(
        `${PUBLIC_API_BASE_URL}/api/v1/partner/stays/enquiries/${enquiryId}/respond`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": csrfToken(),
          },
          body: JSON.stringify({ response, decline: false }),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { detail?: string };
        throw new Error(body.detail ?? "Respond failed.");
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["partner-stays"] }),
  });

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
      <h1 className="text-xl font-bold">Stays</h1>
      {isLoading ? <p className="text-sm">Loading…</p> : null}
      {error ? <p className="text-sm text-signal-700">{(error as Error).message}</p> : null}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase text-text-secondary">Properties</h2>
        <ul className="flex flex-col gap-2">
          {(data?.properties ?? []).map((prop) => (
            <li key={prop.id} className="rounded-lg border border-line p-3 text-sm">
              {prop.title} · {prop.public_state || prop.moderation_status}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase text-text-secondary">Enquiries</h2>
        <label className="mb-2 block text-sm">
          Response template
          <textarea
            className="mt-1 w-full rounded border border-line px-3 py-2"
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            rows={2}
          />
        </label>
        <ul className="flex flex-col gap-2">
          {(data?.enquiries ?? []).map((enquiry) => (
            <li key={enquiry.id} className="rounded-lg border border-line p-3 text-sm">
              <p className="font-semibold">{enquiry.property_title}</p>
              <p>
                {enquiry.check_in} → {enquiry.check_out} · {enquiry.status}
              </p>
              <p className="text-text-secondary">{enquiry.message}</p>
              {enquiry.status === "SUBMITTED" ? (
                <button
                  type="button"
                  className="mt-2 rounded bg-action px-3 py-1.5 text-xs font-semibold text-action-text"
                  onClick={() => respond.mutate(enquiry.id)}
                >
                  Respond
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

export default function PartnerStaysPage() {
  return (
    <PartnerShell requirePartnerRole>
      <PartnerStaysInner />
    </PartnerShell>
  );
}
