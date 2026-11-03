"use client";

import { Button, Dialog } from "@vsolve/ui";
import { useEffect, useState } from "react";

import { Money } from "@/features/checkout/view/money";
import { useBookingPayment } from "@/features/payment/use-booking-payment";
import { CheckoutLoyaltyOptions } from "@/features/payment/view/checkout-loyalty-options";
import { claimViewport } from "@/lib/focus-mode";
import type { BookingGroup } from "../queries";
import { cleanServiceLabel } from "./booking-format";
import { GroupStatusBadge } from "./group-status";

interface PaymentSummaryProps {
  group: BookingGroup;
}

export function PaymentSummarySideCard({ group }: PaymentSummaryProps) {
  const { handlePay, isPaying, payError, profileDialog, loyalty } = useBookingPayment(group);
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
    <aside
      aria-labelledby="payment-summary-heading"
      className="rounded-2xl border border-line bg-surface p-6 shadow-card max-h-[calc(100vh-7rem)] overflow-y-auto"
    >
      {/* Header section with booking count and status */}
      <div className="flex items-center justify-between border-b border-line pb-4">
        <div>
          <h2 id="payment-summary-heading" className="text-lg font-extrabold text-navy-900">
            Payment summary
          </h2>
          <p className="text-xs text-text-secondary mt-0.5">
            {group.units.length} {group.units.length === 1 ? "visit" : "visits"} · Ready for payment
          </p>
        </div>
        <GroupStatusBadge group={group} />
      </div>

      {/* Itemised breakdown */}
      <dl className="mt-5 space-y-3 text-sm">
        {group.units.map((unit, uIdx) => {
          const displayLines = unit.lines.filter(
            (line) => (line.amount?.amount_paise ?? 0) > 0 || line.kind === "SERVICE",
          );
          return (
            <div key={unit.id} className="space-y-2">
              {group.units.length > 1 ? (
                <div className="flex items-center justify-between text-xs font-bold text-navy-900 border-b border-line/40 pb-1">
                  <span className="text-action">Visit {uIdx + 1}</span>
                  <span className="text-[11px] font-normal text-text-secondary">
                    {unit.arrival_window_minutes} min window
                  </span>
                </div>
              ) : null}

              {displayLines.map((line) => {
                const label = cleanServiceLabel(line.label, line.quantity);
                return (
                  <div key={line.id} className="flex items-baseline justify-between gap-3">
                    <dt className="min-w-0 text-text-secondary">
                      {label}
                      {line.quantity > 1 ? (
                        <span className="font-semibold text-navy-700"> × {line.quantity}</span>
                      ) : null}
                    </dt>
                    <dd data-numeric className="shrink-0 font-semibold text-navy-900 tabular-nums">
                      <Money value={line.amount} />
                    </dd>
                  </div>
                );
              })}
            </div>
          );
        })}

        {/* Subtotal if there are taxes/platform fee */}
        {feeOrTaxPaise > 0 ? (
          <div className="flex items-baseline justify-between gap-3 border-t border-line/80 pt-3">
            <dt className="font-bold text-navy-900">Subtotal</dt>
            <dd data-numeric className="font-bold text-navy-900 tabular-nums">
              <Money value={{ amount_paise: itemChargesPaise, currency }} />
            </dd>
          </div>
        ) : null}

        {/* Taxes & Platform Fee if applicable */}
        {feeOrTaxPaise > 0 ? (
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-text-secondary">Taxes & platform fee</dt>
            <dd data-numeric className="font-semibold text-navy-900 tabular-nums">
              <Money value={feeOrTaxMoney} />
            </dd>
          </div>
        ) : null}

        {/* Total Amount */}
        <div className="flex items-baseline justify-between gap-3 border-t border-line/80 pt-3">
          <dt className="font-extrabold text-navy-900 text-base">Amount to pay</dt>
          <dd data-numeric className="text-xl font-extrabold text-navy-900 tabular-nums">
            <Money value={totalMoney} />
          </dd>
        </div>

        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-xs font-medium text-text-muted">Includes GST</dt>
          <dd data-numeric className="text-xs font-medium text-text-muted">All taxes included</dd>
        </div>
      </dl>

      {loyalty.show ? (
        <div className="mt-4 border-t border-line/60 pt-3">
          <CheckoutLoyaltyOptions loyalty={loyalty} />
        </div>
      ) : null}

      {/* Pay Now CTA */}
      <div className="mt-6 space-y-2">
        {payError ? (
          <p className="text-xs text-critical font-medium text-center" role="alert">
            {payError}
          </p>
        ) : null}
        <Button
          loading={isPaying}
          loadingLabel="Opening payment..."
          onClick={handlePay}
          className="w-full justify-center h-12 text-base font-bold shadow-md bg-[#EA580C] hover:bg-[#C2410C] text-white"
        >
          Pay Now →
        </Button>
      </div>

      <p className="mt-3.5 text-center text-xs text-text-secondary">
        256-bit Razorpay secured payment · Free cancellation before arrival
      </p>

      {profileDialog}
    </aside>
  );
}

export function MobilePaymentBottomBar({ group }: PaymentSummaryProps) {
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const { handlePay, isPaying, payError, profileDialog, loyalty } = useBookingPayment(group);

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

          <Button
            loading={isPaying}
            loadingLabel="Opening..."
            onClick={handlePay}
            className="shrink-0 px-6 font-bold shadow-md bg-orange-600 hover:bg-orange-700 text-sm"
          >
            Pay Now →
          </Button>
        </div>
      </div>
      {profileDialog}
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
            {group.units.map((unit, uIdx) => {
              const displayLines = unit.lines.filter(
                (line) => (line.amount?.amount_paise ?? 0) > 0 || line.kind === "SERVICE",
              );
              return (
                <div key={unit.id} className="space-y-1 text-xs">
                  {group.units.length > 1 ? (
                    <p className="font-semibold text-action">Visit {uIdx + 1}</p>
                  ) : null}
                  {displayLines.map((line) => {
                    const label = cleanServiceLabel(line.label, line.quantity);
                    return (
                      <div key={line.id} className="flex justify-between items-center text-text">
                        <span>
                          {label}
                          {line.quantity > 1 ? ` × ${line.quantity}` : ""}
                        </span>
                        <span className="font-semibold tabular-nums">
                          <Money value={line.amount} />
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })}

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

          {loyalty.show ? (
            <div className="border-t border-line/40 pt-3">
              <CheckoutLoyaltyOptions loyalty={loyalty} />
            </div>
          ) : null}

          {payError ? (
            <p className="text-xs text-critical font-medium" role="alert">
              {payError}
            </p>
          ) : null}

          <div className="pt-2">
            <Button
              loading={isPaying}
              loadingLabel="Opening payment..."
              onClick={() => {
                setIsDetailsOpen(false);
                handlePay();
              }}
              className="w-full justify-center text-base font-bold bg-orange-600 hover:bg-orange-700"
            >
              Proceed to Pay →
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
