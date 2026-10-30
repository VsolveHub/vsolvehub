import { Check, Crown, X } from "lucide-react";
import { useT, type Translator } from "@vsolve/ui";
import type { VendorSubscriptionPlan } from "../queries";

function capabilityLabel(t: Translator["t"], code: string): string {
  switch (code) {
    case "FEATURED_PLACEMENT":
      return t("listings.subscription.capability.featuredPlacement");
    case "CANDIDATE_MATCHING":
      return t("listings.subscription.capability.candidateMatching");
    case "CANDIDATE_CONTACT":
      return t("listings.subscription.capability.candidateContact");
    default:
      return code.replaceAll("_", " ");
  }
}

function premiumLabels(t: Translator["t"], plan: VendorSubscriptionPlan): string[] {
  const raw = plan.premium_capabilities;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (typeof entry === "string") return capabilityLabel(t, entry);
      if (entry && typeof entry === "object" && "code" in entry) {
        return capabilityLabel(t, String((entry as { code: string }).code));
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
  const t = useT();
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="my-8 w-full max-w-3xl rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-overlay">
        <div className="flex items-center justify-between border-b border-line pb-4">
          <div>
            <h2 className="text-lg font-bold text-text flex items-center gap-2">
              <Crown className="size-5 text-signal-500" />
              {t("listings.subscription.title")}
            </h2>
            <p className="text-xs text-text-muted">
              {t("listings.subscription.description")}
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
            const premiums = premiumLabels(t, plan);
            const details = typeof plan.details === "string" ? plan.details.trim() : "";
            const serviceLabel =
              typeof plan.service_name === "string" && plan.service_name.trim()
                ? plan.service_name.trim()
                : t("listings.subscription.allHiringServices");

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
                        {t("listings.subscription.current")}
                      </span>
                    )}
                  </div>

                  <p className="mt-1 text-[11px] text-text-muted">{serviceLabel}</p>

                  <div className="mt-3">
                    <span className="text-2xl font-extrabold text-text">₹{priceInRupees}</span>
                    <span className="text-xs text-text-muted"> {t("listings.subscription.perDays", { days: plan.duration_days ?? "" })}</span>
                  </div>

                  {details ? (
                    <p className="mt-3 text-xs leading-5 text-text-secondary">{details}</p>
                  ) : null}

                  <ul className="mt-4 space-y-2 text-xs text-text-secondary">
                    <li className="flex items-center gap-1.5">
                      <Check className="size-3.5 text-success-text shrink-0" />
                      {t("listings.subscription.activeOpenings", { count: plan.max_active_listings ?? "" })}
                    </li>
                    <li className="flex items-center gap-1.5">
                      <Check className="size-3.5 text-success-text shrink-0" />
                      {t("listings.subscription.directContactReveal")}
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
                        {t("listings.subscription.verifiedBadge")}
                      </li>
                    )}
                    {(plan.premium_price_paise ?? 0) > 0 ? (
                      <li className="flex items-center gap-1.5">
                        <Check className="size-3.5 text-success-text shrink-0" />
                        {t("listings.subscription.premiumFrom", { amount: ((plan.premium_price_paise ?? 0) / 100).toFixed(0) })}
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
                      {t("listings.subscription.activePlan")}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onSubscribe(plan.id)}
                      disabled={isPending}
                      className="w-full rounded-control bg-action py-2 text-xs font-semibold text-action-text shadow-card transition hover:bg-action-hover active:bg-action-active disabled:opacity-50"
                    >
                      {isPending ? t("listings.subscription.processing") : t("listings.subscription.selectPlan")}
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
