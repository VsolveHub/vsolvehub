"use client";

import { Badge, Dialog, buttonStyles } from "@vsolve/ui";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Money } from "@/features/checkout/view/money";
import { claimViewport } from "@/lib/focus-mode";
import type { BookingGroup } from "../queries";
import { GroupStatusBadge } from "./group-status";

interface PaymentSummaryProps {
  group: BookingGroup;
}

function formatWhen(instant: string): string {
  return new Date(instant).toLocaleString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function PaymentSummarySideCard({ group }: PaymentSummaryProps) {
  const currency = group.units[0]?.total?.currency ?? "INR";
  const totalPaise = group.units.reduce((acc, u) => acc + (u.total?.amount_paise ?? 0), 0);
  const itemChargesPaise = group.units.reduce(
    (acc, u) => acc + u.lines.reduce((lAcc, l) => lAcc + (l.amount?.amount_paise ?? 0), 0),
    0,
  );
  const feeOrTaxPaise = Math.max(0, totalPaise - itemChargesPaise);

  const totalMoney = { amount_paise: totalPaise, currency };
  const feeOrTaxMoney = { amount_paise: feeOrTaxPaise, currency };

  return (
    <aside className="sticky top-24 rounded-2xl border border-line bg-surface p-5 sm:p-6 shadow-sm">
      {/* Header section with booking count and status */}
      <div className="flex items-start justify-between gap-3 border-b border-line pb-4">
        <div>
          <h2 className="text-xl font-bold text-text">
            {group.units.length} {group.units.length === 1 ? "visit" : "visits"}
          </h2>
          <p className="text-xs text-text-secondary mt-0.5">
            Booked {formatWhen(group.created_at)}
          </p>
        </div>
        <GroupStatusBadge group={group} />
      </div>

      {/* Progress status banner */}
      <div className="mt-4 rounded-xl bg-surface-sunken p-3 text-xs text-text leading-relaxed">
        Every visit has a professional. Payment is the last step.
      </div>

      {/* Booked Services Details directly above Pay Now */}
      <div className="mt-4 space-y-3 border-b border-line pb-4">
        <p className="text-xs font-bold uppercase tracking-wider text-text-secondary">
          Booked Services
        </p>

        <div className="space-y-2.5">
          {group.units.map((unit, uIdx) => (
            <div key={unit.id} className="space-y-1.5 rounded-xl bg-surface-sunken/60 border border-line/60 p-3 text-xs">
              {group.units.length > 1 ? (
                <div className="flex justify-between items-center font-semibold text-text border-b border-line/40 pb-1.5">
                  <span className="text-action">Visit {uIdx + 1}</span>
                  <span className="text-[11px] text-text-secondary font-normal">
                    {unit.arrival_window_minutes} min window
                  </span>
                </div>
              ) : null}

              {unit.lines.map((line) => (
                <div key={line.id} className="flex justify-between items-start text-text gap-2">
                  <span className="font-medium text-slate-700">
                    {line.label}
                    {line.quantity > 1 ? (
                      <span className="text-text-secondary font-normal"> × {line.quantity}</span>
                    ) : null}
                  </span>
                  <span className="font-semibold text-text tabular-nums shrink-0">
                    <Money value={line.amount} />
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Taxes & Platform Fee if applicable */}
        {feeOrTaxPaise > 0 ? (
          <div className="flex justify-between items-center text-xs text-text-secondary pt-1 px-1">
            <span>Taxes & platform fee</span>
            <span className="font-medium text-text tabular-nums">
              <Money value={feeOrTaxMoney} />
            </span>
          </div>
        ) : null}
      </div>

      {/* Total Amount */}
      <div className="mt-4 flex items-baseline justify-between px-1">
        <span className="text-sm font-bold text-text">Total Payable</span>
        <span className="text-2xl font-extrabold text-navy-900">
          <Money value={totalMoney} />
        </span>
      </div>

      {/* Pay Now CTA */}
      <div className="mt-5">
        <Link
          href={`/bookings/${group.id}/pay`}
          className={buttonStyles({
            className: "w-full justify-center h-12 text-base font-bold shadow-md bg-orange-600 hover:bg-orange-700",
          })}
        >
          Pay Now →
        </Link>
      </div>

      {/* Trust & Guarantee */}
      <div className="mt-5 pt-4 border-t border-line/60 space-y-2 text-[11px] text-text-secondary">
        <div className="flex items-center gap-2">
          <span className="text-success font-bold text-xs">🔒</span>
          <span>256-bit Razorpay secured payment</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-success font-bold text-xs">🛡️</span>
          <span>100% money back guarantee on cancellation</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-success font-bold text-xs">✓</span>
          <span>Real partner details unlocked immediately</span>
        </div>
      </div>
    </aside>
  );
}

export function MobilePaymentBottomBar({ group }: PaymentSummaryProps) {
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  useEffect(() => {
    return claimViewport();
  }, []);

  const currency = group.units[0]?.total?.currency ?? "INR";
  const totalPaise = group.units.reduce((acc, u) => acc + (u.total?.amount_paise ?? 0), 0);
  const itemChargesPaise = group.units.reduce(
    (acc, u) => acc + u.lines.reduce((lAcc, l) => lAcc + (l.amount?.amount_paise ?? 0), 0),
    0,
  );
  const feeOrTaxPaise = Math.max(0, totalPaise - itemChargesPaise);

  const totalMoney = { amount_paise: totalPaise, currency };
  const feeOrTaxMoney = { amount_paise: feeOrTaxPaise, currency };

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-[60] bg-white border-t border-line px-4 pt-3.5 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] shadow-[0_-4px_20px_rgba(0,0,0,0.08)] lg:hidden">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-4">
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => setIsDetailsOpen(true)}
              className="text-left group cursor-pointer"
            >
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-black text-navy-900">
                  <Money value={totalMoney} />
                </span>
                <span className="text-xs text-action font-semibold group-hover:underline">
                  View details ℹ️
                </span>
              </div>
              <p className="text-[11px] text-text-secondary truncate">
                {group.units.length} {group.units.length === 1 ? "visit" : "visits"} · Ready to pay
              </p>
            </button>
          </div>

          <Link
            href={`/bookings/${group.id}/pay`}
            className={buttonStyles({
              className: "shrink-0 px-6 font-bold shadow-md bg-orange-600 hover:bg-orange-700",
            })}
          >
            Pay Now →
          </Link>
        </div>
      </div>
      {/* Background bleeder to guarantee zero gap on any mobile viewport bounce/scroll */}
      <div className="fixed inset-x-0 -bottom-16 h-16 bg-white z-[60] lg:hidden pointer-events-none" />

      {/* Expandable Breakdown Drawer / Dialog on Mobile */}
      <Dialog
        open={isDetailsOpen}
        onOpenChange={setIsDetailsOpen}
        title="Payment Breakdown"
      >
        <div className="p-4 space-y-4">
          <div className="space-y-2 border-b border-line pb-3">
            {group.units.map((unit, uIdx) => (
              <div key={unit.id} className="space-y-1 text-xs">
                {group.units.length > 1 ? (
                  <p className="font-semibold text-action">Visit {uIdx + 1}</p>
                ) : null}
                {unit.lines.map((line) => (
                  <div key={line.id} className="flex justify-between items-center text-text">
                    <span>
                      {line.label}
                      {line.quantity > 1 ? ` × ${line.quantity}` : ""}
                    </span>
                    <span className="font-semibold tabular-nums">
                      <Money value={line.amount} />
                    </span>
                  </div>
                ))}
              </div>
            ))}

            {feeOrTaxPaise > 0 ? (
              <div className="flex justify-between items-center text-xs text-text-secondary pt-1 border-t border-line/40">
                <span>Taxes & platform fees</span>
                <span className="font-semibold text-text">
                  <Money value={feeOrTaxMoney} />
                </span>
              </div>
            ) : null}
          </div>

          <div className="flex justify-between items-baseline font-bold text-sm text-text">
            <span>Total Payable</span>
            <span className="text-xl font-extrabold text-navy-900">
              <Money value={totalMoney} />
            </span>
          </div>

          <div className="pt-2">
            <Link
              href={`/bookings/${group.id}/pay`}
              className={buttonStyles({
                className: "w-full justify-center text-base font-bold bg-orange-600 hover:bg-orange-700",
              })}
            >
              Proceed to Pay →
            </Link>
          </div>
        </div>
      </Dialog>
    </>
  );
}
