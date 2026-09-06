"use client";

import React from "react";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  CalendarCheck,
  CheckCircle2,
  Clock,
  Coins,
  CreditCard,
  Lock,
  ShieldCheck,
  Wallet,
} from "lucide-react";

import { usePartnerStayMoney } from "@/features/stays/queries";

function formatPaise(paise: number): string {
  return "₹" + (paise / 100).toLocaleString("en-IN");
}

export function StayMoney() {
  const { data, isLoading } = usePartnerStayMoney();
  const entries = data?.entries ?? [];

  return (
    <div className="w-full pb-16 pt-6 bg-neutral-50 min-h-[calc(100vh-4rem)]">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 border border-indigo-200/60 px-3 py-0.5 text-xs font-bold text-indigo-700">
              <Wallet className="h-3.5 w-3.5" /> Financials & Ledgers
            </div>
            <h1 className="mt-2 text-2xl sm:text-3xl font-black text-neutral-900 tracking-tight">
              Stays & Host Earnings
            </h1>
            <p className="mt-0.5 text-sm text-neutral-500">
              Track rental income, guest security deposits held in escrow, and platform settlements.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/stays/reservations"
              className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-300 bg-white px-4 py-2 text-xs font-bold text-neutral-800 shadow-sm hover:border-neutral-400 transition-colors"
            >
              Guest Bookings
            </Link>
          </div>
        </div>

        {/* Financial KPI Cards */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between text-xs font-bold text-neutral-500">
              <span>Available for Payout</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="mt-3 text-2xl font-black text-emerald-700">
              {isLoading ? "—" : formatPaise(data?.available_paise ?? 0)}
            </div>
            <p className="mt-1 text-[11px] text-neutral-500">
              Settled &amp; ready for next weekly batch transfer
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between text-xs font-bold text-neutral-500">
              <span>Pending Settlement</span>
              <Clock className="h-4 w-4 text-amber-600" />
            </div>
            <div className="mt-3 text-2xl font-black text-amber-800">
              {isLoading ? "—" : formatPaise(data?.pending_paise ?? 0)}
            </div>
            <p className="mt-1 text-[11px] text-neutral-500">
              Unsettled earnings (active hold / move-in window)
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between text-xs font-bold text-neutral-500">
              <span>Transferred / Paid</span>
              <CreditCard className="h-4 w-4 text-indigo-600" />
            </div>
            <div className="mt-3 text-2xl font-black text-indigo-900">
              {isLoading ? "—" : formatPaise(data?.paid_paise ?? 0)}
            </div>
            <p className="mt-1 text-[11px] text-neutral-500">
              Successfully disbursed via completed payout batches
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between text-xs font-bold text-neutral-500">
              <span>Guest Escrow Deposits</span>
              <Lock className="h-4 w-4 text-purple-600" />
            </div>
            <div className="mt-3 text-2xl font-black text-purple-900">
              {isLoading ? "—" : formatPaise(data?.deposit_held_paise ?? 0)}
            </div>
            <p className="mt-1 text-[11px] text-neutral-500">
              Custody held in platform escrow until check-out
            </p>
          </div>
        </div>

        {/* Security Deposits & Host Earnings Ledger */}
        <div className="mt-8 rounded-2xl border border-neutral-200/80 bg-white p-6 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-100 pb-4">
            <div>
              <h3 className="text-base font-bold text-neutral-900">Host Earnings &amp; Payout Ledger</h3>
              <p className="text-xs text-neutral-500">
                Immutable settlement entries and payout batch execution records.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-emerald-50 border border-emerald-200/60 px-2.5 py-1 text-xs font-bold text-emerald-800">
                Total Volume: {formatPaise(data?.gross_paise ?? 0)}
              </span>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-neutral-200 text-[11px] uppercase tracking-wider text-neutral-400">
                  <th className="pb-3 font-bold">Reservation</th>
                  <th className="pb-3 font-bold">Property</th>
                  <th className="pb-3 font-bold">Gross Rent</th>
                  <th className="pb-3 font-bold">Platform Fee</th>
                  <th className="pb-3 font-bold">Net Host Earning</th>
                  <th className="pb-3 font-bold">Payout Batch Lifecycle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {entries.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-neutral-400">
                      No stay earnings have reached the ledger yet.
                    </td>
                  </tr>
                ) : (
                  entries.map((r) => (
                    <tr key={r.id} className="hover:bg-neutral-50/60">
                      <td className="py-3 font-mono font-semibold text-neutral-800">
                        {r.reservation_id.slice(0, 8)}…
                      </td>
                      <td className="py-3">
                        <div className="font-bold text-neutral-900">{r.property_title}</div>
                        <div className="text-[11px] text-neutral-500">{r.kind}</div>
                      </td>
                      <td className="py-3 text-neutral-600">
                        {formatPaise(r.gross_paise)}
                        <div className="text-[10px] text-neutral-400">{new Date(r.created_at).toLocaleDateString("en-IN")}</div>
                      </td>
                      <td className="py-3 font-bold text-neutral-500">
                        {formatPaise(r.commission_paise)}
                      </td>
                      <td className="py-3 font-black text-neutral-900">
                        {formatPaise(r.net_paise)}
                      </td>
                      <td className="py-3">
                        {r.status === "PAID" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800">
                            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                            Paid {r.payout_batch_reference ? `(${r.payout_batch_reference})` : ""}
                          </span>
                        ) : r.status === "RESERVED" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-2.5 py-0.5 text-[10px] font-bold text-blue-800">
                            <Clock className="h-3 w-3 text-blue-600" />
                            In Batch {r.payout_batch_reference ? `(${r.payout_batch_reference})` : ""}
                          </span>
                        ) : r.status === "AVAILABLE" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 border border-purple-200 px-2.5 py-0.5 text-[10px] font-bold text-purple-800">
                            <CheckCircle2 className="h-3 w-3 text-purple-600" />
                            Settled (Available)
                          </span>
                        ) : r.status === "PENDING" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-[10px] font-bold text-amber-800">
                            <Clock className="h-3 w-3 text-amber-600" />
                            Pending Clearance
                          </span>
                        ) : (
                          <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-[10px] font-bold text-neutral-700">
                            {r.status}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
