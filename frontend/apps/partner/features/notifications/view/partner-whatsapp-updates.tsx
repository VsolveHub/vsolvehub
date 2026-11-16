"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { request } from "@vsolve/api-client";
import { describeError } from "@vsolve/query";
import { MessageCircle } from "lucide-react";

import { getApiClient } from "@/lib/api/browser";

/**
 * One switch for WhatsApp updates (contract 1.99.0).
 *
 * WhatsApp is opt-in: nothing is sent on it until the partner turns it on
 * here, which stores `{channel: "WHATSAPP", purpose: "whatsapp-updates"}` with
 * Django. Which notices then go to WhatsApp (confirmed jobs, payments, account
 * decisions) is the backend's `notifications/channel_plan.py`, not this card.
 *
 * Not optimistic: the switch moves when Django's own record comes back, so a
 * failed save can never show "on" while nothing will be sent.
 *
 * Hidden unless `NEXT_PUBLIC_WHATSAPP_UPDATES_ENABLED` is "true": offering
 * WhatsApp on a deployment that cannot send it would be a promise nobody keeps.
 */

const ENABLED = process.env.NEXT_PUBLIC_WHATSAPP_UPDATES_ENABLED === "true";
const PURPOSE = "whatsapp-updates";
const QUERY_KEY = ["partner", "communication-preferences"] as const;

export function PartnerWhatsAppUpdatesCard() {
  if (!ENABLED) return null;
  return <WhatsAppSwitch />;
}

function WhatsAppSwitch() {
  const queryClient = useQueryClient();
  const preferences = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => request(() => getApiClient().GET("/api/v1/auth/privacy/preferences/")),
    staleTime: 60_000,
  });
  const save = useMutation({
    mutationFn: (isEnabled: boolean) =>
      request(() =>
        getApiClient().PUT("/api/v1/auth/privacy/preferences/", {
          body: { channel: "WHATSAPP", purpose: PURPOSE, is_enabled: isEnabled },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  if (preferences.isPending || preferences.isError) return null;
  const isOn = (preferences.data ?? []).some(
    (row) => row.channel === "WHATSAPP" && row.purpose === PURPOSE && row.is_enabled,
  );

  return (
    <div className="mt-1.5 overflow-hidden rounded-2xl border border-line bg-surface p-4 shadow-xs">
      <label className="flex cursor-pointer items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
          <MessageCircle className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-text">WhatsApp updates</span>
          <span className="mt-0.5 block text-xs text-text-secondary">
            Confirmed jobs, payments and account decisions on your registered number.
          </span>
          {save.isError ? (
            <span role="alert" className="mt-1 block text-xs font-medium text-danger-text">
              {describeError(save.error, "mutation").message}
            </span>
          ) : null}
        </span>
        <input
          type="checkbox"
          checked={isOn}
          disabled={save.isPending}
          onChange={(event) => save.mutate(event.target.checked)}
          aria-label="WhatsApp updates"
          className="mt-2 h-6 w-6 shrink-0 cursor-pointer rounded-sm border border-line-strong accent-action disabled:cursor-wait"
        />
      </label>
    </div>
  );
}
