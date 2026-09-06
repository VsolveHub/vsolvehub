"use client";

import React from "react";
import { AlertCircle, ShieldCheck, Wallet, Receipt } from "lucide-react";

import { usePartnerRentalBookings, usePartnerRentalLedger } from "@/features/rentals/queries";
import { usePartnerPayoutAccount } from "@/features/earnings/queries";

function rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

export default function PartnerRentalsMoneyPage() {
  const { data: bookings, isLoading: bookingsLoading, isError: bookingsError } =
    usePartnerRentalBookings();
  const { data: ledgerPage, isLoading: ledgerLoading, isError: ledgerError } = usePartnerRentalLedger();
  const { data: payoutAccount } = usePartnerPayoutAccount();

  const deposits = (bookings ?? []).map((b) => b.deposit).filter((d): d is NonNullable<typeof d> => Boolean(d));
  const outstanding = deposits.filter((d) => d.status === "AUTHORIZED" || d.status === "HELD");
  const settled = deposits.filter(
    (d) => d.status === "RELEASED" || d.status === "PARTIALLY_CONSUMED" || d.status === "FULLY_CONSUMED",
  );

  const outstandingTotal = outstanding.reduce((sum, d) => sum + d.authorized_amount_paise, 0);

  return (
    <div className="min-h-screen bg-neutral-50 pb-20 pt-6">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <h1 className="text-2xl sm:text-3xl font-black text-neutral-900">Rental Money</h1>
        <p className="mt-0.5 text-sm text-neutral-500">
          Deposit holds, settlement history, rental earnings, and your payout account.
        </p>

        {bookingsError || ledgerError ? (
          <div className="mt-8 flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-600">
            <AlertCircle className="h-5 w-5" /> Unable to load your rental earnings right now.
          </div>
        ) : (
          <>
            <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
                <span className="flex items-center gap-1 text-xs font-bold uppercase text-neutral-400">
                  <ShieldCheck className="h-3.5 w-3.5" /> Deposits Outstanding
                </span>
                <p className="mt-1 text-2xl font-black text-neutral-900">
                  {bookingsLoading ? "…" : rupees(outstandingTotal)}
                </p>
                <span className="text-xs text-neutral-500">
                  {outstanding.length} held in escrow across active rentals
                </span>
              </div>

              <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
                <span className="flex items-center gap-1 text-xs font-bold uppercase text-neutral-400">
                  <Receipt className="h-3.5 w-3.5" /> Deposits Settled
                </span>
                <p className="mt-1 text-2xl font-black text-neutral-900">
                  {bookingsLoading ? "…" : settled.length}
                </p>
                <span className="text-xs text-neutral-500">Released or consumed after inspection</span>
              </div>

              <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
                <span className="flex items-center gap-1 text-xs font-bold uppercase text-neutral-400">
                  <Wallet className="h-3.5 w-3.5" /> Payout Account
                </span>
                <p className="mt-1 text-sm font-bold text-neutral-900">
                  {payoutAccount ? "Registered" : "Not registered yet"}
                </p>
                <span className="text-xs text-neutral-500">
                  Same payout account as every other workspace
                </span>
              </div>
            </div>

            <div className="mt-8 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
              <div className="border-b border-neutral-100 p-5">
                <h2 className="text-base font-bold text-neutral-900">Rental Earnings Ledger</h2>
              </div>
              {ledgerLoading ? (
                <div className="p-12 text-center text-sm text-neutral-500">Loading ledger…</div>
              ) : !ledgerPage || ledgerPage.results.length === 0 ? (
                <div className="p-12 text-center text-sm text-neutral-500">No rental ledger entries yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-neutral-50 text-xs font-bold uppercase text-neutral-500 border-b border-neutral-200">
                      <tr>
                        <th className="p-4">Date</th>
                        <th className="p-4">Kind</th>
                        <th className="p-4">Status</th>
                        <th className="p-4">Gross</th>
                        <th className="p-4">Commission</th>
                        <th className="p-4">Net</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {ledgerPage.results.map((entry) => (
                        <tr key={entry.id}>
                          <td className="p-4 text-xs text-neutral-500">
                            {new Date(entry.created_at).toLocaleDateString("en-IN")}
                          </td>
                          <td className="p-4 text-xs font-semibold text-neutral-700">{entry.kind}</td>
                          <td className="p-4 text-xs text-neutral-600">{entry.status}</td>
                          <td className="p-4 font-semibold text-neutral-900">{rupees(entry.gross_paise)}</td>
                          <td className="p-4 text-neutral-600">{rupees(entry.commission_paise)}</td>
                          <td className="p-4 font-bold text-emerald-700">{rupees(entry.net_paise)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
