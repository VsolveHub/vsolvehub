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
      <div className="my-8 w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-950 flex items-center gap-2">
              <Crown className="h-5 w-5 text-amber-500" />
              Hiring Subscription Plans
            </h2>
            <p className="text-xs text-slate-500">
              Upgrade your listing capacity and unlock premium featured placements.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {plans.map((plan) => {
            const priceInRupees = plan.price_paise / 100;
            const isCurrent = currentPlanName === plan.name;

            return (
              <div
                key={plan.id}
                className={`flex flex-col justify-between rounded-xl border p-5 transition ${
                  isCurrent
                    ? "border-amber-400 bg-amber-50/30 ring-1 ring-amber-400"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-slate-950">{plan.name}</h3>
                    {isCurrent && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                        Active
                      </span>
                    )}
                  </div>

                  <div className="mt-3 text-2xl font-extrabold text-slate-950">
                    ₹{priceInRupees.toLocaleString()}
                    <span className="text-xs font-normal text-slate-500">
                      {" "}/ {plan.duration_days} days
                    </span>
                  </div>

                  <ul className="mt-4 space-y-2 text-xs text-slate-600">
                    <li className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                      <span>
                        Up to <strong>{plan.max_active_listings}</strong> active listings
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                      <span>Direct candidate contact unlock</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                      <span>Candidate lead status tracker</span>
                    </li>
                  </ul>
                </div>

                <button
                  type="button"
                  onClick={() => onSubscribe(plan.id)}
                  disabled={isPending || isCurrent}
                  className={`mt-6 w-full rounded-lg py-2 text-xs font-semibold transition ${
                    isCurrent
                      ? "bg-slate-100 text-slate-400 cursor-default"
                      : "bg-indigo-600 text-white hover:bg-indigo-700"
                  }`}
                >
                  {isCurrent ? "Current Plan" : isPending ? "Activating..." : "Subscribe"}
                </button>
              </div>
            );
          })}
        </div>

        {error && <p className="mt-4 text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}
