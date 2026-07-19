"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Shown when no professional can take the chosen slot — either at the pre-payment
// gate (nothing charged) or after a gate-to-assign race where the payment was
// refunded in full. It never dead-ends: every suggested slot jumps the customer
// straight back to the slot step with that time preselected.
// ─────────────────────────────────────────────────────────────────────────────

import { FlaticonIcon } from "@/components/ui/FlaticonIcon";

export type SlotSuggestion = { slotIso: string; label: string; count: number };

type Props = {
  /** Human label for the slot that came up empty, e.g. "Tue · 02–04 PM". */
  slotLabel: string;
  suggestedSlots: SlotSuggestion[];
  /** True on the post-payment race path — money was returned in full. */
  refunded?: boolean;
  onPickSlot: (slotIso: string) => void;
  onTryAgain: () => void;
  onGoHome: () => void;
};

export function NoProvidersScreen({
  slotLabel,
  suggestedSlots,
  refunded,
  onPickSlot,
  onTryAgain,
  onGoHome,
}: Props) {
  return (
    <div className="mx-auto w-full max-w-md px-5 py-10 text-center">
      <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-amber-50 ring-8 ring-amber-50/40">
        <FlaticonIcon name="calendar" size={34} />
      </div>

      <h1 className="text-xl font-black text-gray-900">No professionals available</h1>
      <p className="mt-2 text-sm text-gray-500">
        Nobody is free for <strong className="text-gray-800">{slotLabel}</strong> right now.
      </p>

      {refunded && (
        <div className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-xs font-semibold text-green-800">
          <FlaticonIcon name="shield" size={14} />
          You have not been charged — your payment was refunded in full.
        </div>
      )}

      {suggestedSlots.length > 0 && (
        <div className="mt-8 text-left">
          <p className="mb-3 text-[0.72rem] font-bold uppercase tracking-[0.08em] text-gray-500">
            Try one of these instead
          </p>
          <div className="flex flex-col gap-2.5">
            {suggestedSlots.map((s) => (
              <button
                key={s.slotIso}
                type="button"
                onClick={() => onPickSlot(s.slotIso)}
                className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white px-4 py-3.5 text-left transition-colors hover:border-brand hover:bg-blue-50/40"
              >
                <span className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-brand">
                    <FlaticonIcon name="calendar" size={16} />
                  </span>
                  <span className="text-sm font-bold text-gray-900">{s.label}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="rounded-full bg-green-50 px-2 py-0.5 text-[0.7rem] font-bold text-green-700">
                    {s.count} available
                  </span>
                  <span className="text-lg text-gray-300">›</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8 flex flex-col gap-3">
        <button
          type="button"
          onClick={onTryAgain}
          className="w-full rounded-xl bg-brand py-3.5 text-sm font-bold text-white transition-opacity hover:opacity-90"
        >
          Pick another time
        </button>
        <button
          type="button"
          onClick={onGoHome}
          className="w-full rounded-xl border border-gray-200 py-3.5 text-sm font-bold text-gray-600 transition-colors hover:bg-gray-50"
        >
          Go home
        </button>
      </div>
    </div>
  );
}
