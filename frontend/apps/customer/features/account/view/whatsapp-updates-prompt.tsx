"use client";

import { describeError } from "@vsolve/query";
import { Button, Card } from "@vsolve/ui";
import { MessageCircle, X } from "lucide-react";
import { useState } from "react";

import { useCommunicationPreferences, useSetCommunicationPreference } from "../queries";

/**
 * Asks once for WhatsApp booking updates (contract 1.99.0).
 *
 * WhatsApp is opt-in: nothing is sent on it until the customer turns it on
 * here, which stores `{channel: "WHATSAPP", purpose: "booking-updates"}` with
 * Django. Once on, this card disappears and the switch to turn it off lives
 * with the other message settings, so there is one place to undo it.
 *
 * Hidden unless `NEXT_PUBLIC_WHATSAPP_UPDATES_ENABLED` is "true": offering
 * WhatsApp updates on a deployment that cannot send them would be a promise
 * nobody keeps.
 */

const ENABLED = process.env.NEXT_PUBLIC_WHATSAPP_UPDATES_ENABLED === "true";
const PURPOSE = "booking-updates";
const DISMISSED_KEY = "vsh_whatsapp_updates_prompt_dismissed";

function wasDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function WhatsAppUpdatesPrompt({ className = "" }: { className?: string }) {
  if (!ENABLED) return null;
  return <Prompt className={className} />;
}

function Prompt({ className }: { className: string }) {
  const preferences = useCommunicationPreferences();
  const setPreference = useSetCommunicationPreference();
  const [dismissed, setDismissed] = useState(() =>
    typeof window === "undefined" ? false : wasDismissed(),
  );

  const optedIn = (preferences.data ?? []).some(
    (row) => row.channel === "WHATSAPP" && row.purpose === PURPOSE && row.is_enabled,
  );
  if (preferences.isPending || preferences.isError || optedIn || dismissed) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Storage unavailable: the card simply returns on the next visit.
    }
    setDismissed(true);
  };

  return (
    <Card
      className={`relative border-navy-950/10 bg-white p-4 shadow-sm sm:p-5 ${className}`}
      role="region"
      aria-label="WhatsApp booking updates"
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute right-3.5 top-3.5 inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white">
          <MessageCircle className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1 space-y-1.5 pr-6">
          <h3 className="text-sm font-bold text-slate-900 sm:text-base">
            Get booking updates on WhatsApp
          </h3>
          <p className="text-xs text-slate-600 sm:text-sm">
            We&apos;ll message your registered mobile number when your booking is confirmed,
            when your professional is on the way, and when the work is done. Turn it off any
            time in Message settings.
          </p>
          {setPreference.isError ? (
            <p role="alert" className="text-xs text-red-700">
              {describeError(setPreference.error, "mutation").message}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Button
              variant="primary"
              size="sm"
              loading={setPreference.isPending}
              onClick={() =>
                setPreference.mutate({ channel: "WHATSAPP", purpose: PURPOSE, isEnabled: true })
              }
              className="text-xs font-semibold"
            >
              Turn on WhatsApp updates
            </Button>
            <Button variant="ghost" size="sm" onClick={dismiss} className="text-xs text-slate-500">
              Not now
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
