import { Check, Crown, X } from "lucide-react";
import type { VendorSubscriptionPlan } from "../queries";

export interface SubscriptionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  plans: VendorSubscriptionPlan[];
  currentPlanName?: string;
  onSubscribe: (planId: string) => void;
  isPending: boolean;
  error?: string;
}

export function SubscriptionDialog({
  isOpen,
  onClose,
  plans,
  currentPlanName,
  onSubscribe,
  isPending,
  error,
}: SubscriptionDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="my-8 w-full max-w-3xl rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-overlay">
        <div className="flex items-center justify-between border-b border-line pb-4">
          <div>
            <h2 className="text-lg font-bold text-text flex items-center gap-2">
              <Crown className="size-5 text-signal-500" />
              Hiring Subscription Plans
            </h2>
            <p className="text-xs text-text-muted">
              Upgrade your listing capacity and unlock premium featured placements.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-control p-1.5 text-text-muted hover:bg-surface-hover"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {plans.map((plan) => {
            const priceInRupees = plan.price_paise / 100;
            const isCurrent = currentPlanName === plan.name;

            return (
              <div
                key={plan.id}
                className={`flex flex-col justify-between rounded-[var(--radius-card)] border p-5 transition ${
                  isCurrent
                    ? "border-signal-400 bg-signal-50/40 ring-1 ring-signal-400"
                    : "border-line bg-surface hover:border-line-strong"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-text">{plan.name}</h3>
                    {isCurrent && (
                      <span className="rounded-full bg-signal-100 px-2 py-0.5 text-[10px] font-bold text-signal-800">
                        Current
                      </span>
                    )}
                  </div>

                  <div className="mt-3">
                    <span className="text-2xl font-extrabold text-text">₹{priceInRupees}</span>
                    <span className="text-xs text-text-muted"> / {plan.duration_days} days</span>
                  </div>

                  <ul className="mt-4 space-y-2 text-xs text-text-secondary">
                    <li className="flex items-center gap-1.5">
                      <Check className="size-3.5 text-success-text shrink-0" />
                      Up to {plan.max_active_listings} active openings
                    </li>
                    <li className="flex items-center gap-1.5">
                      <Check className="size-3.5 text-success-text shrink-0" />
                      Direct applicant contact reveal
                    </li>
                    <li className="flex items-center gap-1.5">
                      <Check className="size-3.5 text-success-text shrink-0" />
                      Verified hiring badge
                    </li>
                  </ul>
                </div>

                <div className="mt-6">
                  {isCurrent ? (
                    <button
                      type="button"
                      disabled
                      className="w-full rounded-control border border-line bg-surface-sunken py-2 text-xs font-semibold text-text-muted"
                    >
                      Active Plan
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onSubscribe(plan.id)}
                      disabled={isPending}
                      className="w-full rounded-control bg-action py-2 text-xs font-semibold text-action-text shadow-card transition hover:bg-action-hover active:bg-action-active disabled:opacity-50"
                    >
                      {isPending ? "Processing..." : "Select Plan"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {error && <p className="mt-4 text-xs text-danger-text text-center">{error}</p>}
      </div>
    </div>
  );
}
