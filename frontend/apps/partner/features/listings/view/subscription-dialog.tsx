import { Check, Crown, X } from "lucide-react";
import type { VendorSubscriptionPlan } from "../queries";

const CAPABILITY_LABELS: Record<string, string> = {
  FEATURED_PLACEMENT: "Featured jobs",
  CANDIDATE_MATCHING: "Matching candidates: see and invite people before they apply",
  CANDIDATE_CONTACT: "Candidate phone numbers in matches",
};

function premiumLabels(plan: VendorSubscriptionPlan): string[] {
  const raw = plan.premium_capabilities;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (typeof entry === "string") return CAPABILITY_LABELS[entry] ?? entry.replaceAll("_", " ");
      if (entry && typeof entry === "object" && "code" in entry) {
        return String((entry as { code: string }).code).replaceAll("_", " ");
      }
      return "";
    })
    .filter(Boolean);
}

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
            const premiums = premiumLabels(plan);
            const details = typeof plan.details === "string" ? plan.details.trim() : "";
            const serviceLabel =
              typeof plan.service_name === "string" && plan.service_name.trim()
                ? plan.service_name.trim()
                : "All hiring services";

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
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-bold text-text">{plan.name}</h3>
                    {isCurrent && (
                      <span className="rounded-full bg-signal-100 px-2 py-0.5 text-[10px] font-bold text-signal-800">
                        Current
                      </span>
                    )}
                  </div>

                  <p className="mt-1 text-[11px] text-text-muted">{serviceLabel}</p>

                  <div className="mt-3">
                    <span className="text-2xl font-extrabold text-text">₹{priceInRupees}</span>
                    <span className="text-xs text-text-muted"> / {plan.duration_days} days</span>
                  </div>

                  {details ? (
                    <p className="mt-3 text-xs leading-5 text-text-secondary">{details}</p>
                  ) : null}

                  <ul className="mt-4 space-y-2 text-xs text-text-secondary">
                    <li className="flex items-center gap-1.5">
                      <Check className="size-3.5 text-success-text shrink-0" />
                      Up to {plan.max_active_listings} active openings
                    </li>
                    <li className="flex items-center gap-1.5">
                      <Check className="size-3.5 text-success-text shrink-0" />
                      Direct applicant contact reveal
                    </li>
                    {premiums.length > 0 ? (
                      premiums.map((label) => (
                        <li key={label} className="flex items-center gap-1.5">
                          <Check className="size-3.5 text-success-text shrink-0" />
                          <span className="capitalize">{label}</span>
                        </li>
                      ))
                    ) : (
                      <li className="flex items-center gap-1.5">
                        <Check className="size-3.5 text-success-text shrink-0" />
                        Verified hiring badge
                      </li>
                    )}
                    {(plan.premium_price_paise ?? 0) > 0 ? (
                      <li className="flex items-center gap-1.5">
                        <Check className="size-3.5 text-success-text shrink-0" />
                        Premium placement from ₹{((plan.premium_price_paise ?? 0) / 100).toFixed(0)}
                      </li>
                    ) : null}
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
