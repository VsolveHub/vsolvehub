"use client";

import React from "react";
import Link from "next/link";
import { Package, Plus, AlertCircle } from "lucide-react";

import { usePartnerRentalAssets } from "@/features/rentals/queries";

export default function PartnerRentalsInventoryPage() {
  const { data: assets, isLoading, isError, error } = usePartnerRentalAssets();

  return (
    <div className="min-h-screen bg-neutral-50 pb-20 pt-6">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        {/* Workspace Nav Header */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-800 uppercase">
              <Package className="h-3.5 w-3.5" /> A7 Rental Workspace
            </span>
            <h1 className="mt-1.5 text-2xl sm:text-3xl font-black text-neutral-900">
              Equipment & Rental Inventory
            </h1>
            <p className="mt-0.5 text-sm text-neutral-500">
              Manage your serialized and pooled assets, track active leases, and inspect returns.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/rentals/bookings"
              className="flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-xs font-bold text-neutral-800 shadow-sm hover:border-neutral-400"
            >
              Active Bookings
            </Link>
            <Link
              href="/rentals/new"
              className="flex items-center gap-1.5 rounded-lg bg-action px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#d65f1a]"
            >
              <Plus className="h-3.5 w-3.5" /> List New Item
            </Link>
          </div>
        </div>

        {/* Stats Row */}
        <div className="mb-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
            <span className="text-xs font-bold uppercase text-neutral-400">Total Listed Assets</span>
            <p className="mt-1 text-2xl font-black text-neutral-900">{assets?.length ?? 0}</p>
            <span className="text-xs text-emerald-600 font-medium">All active in search</span>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
            <span className="text-xs font-bold uppercase text-neutral-400">Pool Units Tracked</span>
            <p className="mt-1 text-2xl font-black text-neutral-900">
              {(assets ?? []).reduce((sum, a) => sum + (a.is_serialized ? 1 : a.quantity_available), 0)}
            </p>
            <span className="text-xs text-neutral-500">Serialized + Fungible pools</span>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
            <span className="text-xs font-bold uppercase text-neutral-400">Escrow Security</span>
            <p className="mt-1 text-2xl font-black text-emerald-600">100% Guaranteed</p>
            <span className="text-xs text-neutral-500">Held in VSolve Escrow Trust</span>
          </div>
        </div>

        {/* Inventory Table */}
        <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
          <div className="border-b border-neutral-100 p-5 flex items-center justify-between">
            <h2 className="text-base font-bold text-neutral-900">Registered Equipment Units</h2>
          </div>

          {isLoading ? (
            <div className="p-12 text-center text-sm text-neutral-500">Loading equipment assets...</div>
          ) : isError ? (
            <div className="p-12 text-center text-sm text-red-600 flex flex-col items-center gap-2">
              <AlertCircle className="h-6 w-6" />
              {error instanceof Error ? error.message : "Unable to load your inventory."}
            </div>
          ) : !assets || assets.length === 0 ? (
            <div className="p-12 text-center text-sm text-neutral-500">
              No equipment listed yet.{" "}
              <Link href="/rentals/new" className="font-semibold text-action hover:underline">
                List your first item
              </Link>
              .
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-neutral-50 text-xs font-bold uppercase text-neutral-500 border-b border-neutral-200">
                  <tr>
                    <th className="p-4">Equipment Title</th>
                    <th className="p-4">Serial / Ident</th>
                    <th className="p-4">Tracking Mode</th>
                    <th className="p-4">Daily Rate</th>
                    <th className="p-4">Deposit</th>
                    <th className="p-4">Condition</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {assets.map((item) => (
                    <tr key={item.id}>
                      <td className="p-4">
                        <Link
                          href={`/rentals/${item.id}/edit`}
                          className="font-bold text-neutral-900 hover:text-action hover:underline"
                        >
                          {item.title}
                        </Link>
                        <span className="block text-xs font-normal text-neutral-500 line-clamp-1">
                          {item.description}
                        </span>
                      </td>
                      <td className="p-4 font-mono text-xs text-neutral-700">
                        {item.asset_identifier || "—"}
                      </td>
                      <td className="p-4">
                        {item.is_serialized ? (
                          <span className="inline-flex rounded bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                            Serialized (1 unit)
                          </span>
                        ) : (
                          <span className="inline-flex rounded bg-purple-50 px-2 py-0.5 text-xs font-semibold text-purple-700">
                            Pooled ({item.quantity_available} units)
                          </span>
                        )}
                      </td>
                      <td className="p-4 font-semibold text-neutral-900">
                        ₹{(item.daily_price_paise / 100).toLocaleString("en-IN")}
                      </td>
                      <td className="p-4 text-neutral-700">
                        ₹{(item.deposit_paise / 100).toLocaleString("en-IN")}
                      </td>
                      <td className="p-4">
                        <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700 capitalize">
                          {item.condition_grade.toLowerCase()}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
                          ● {item.current_status}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <Link
                          href={`/rentals/${item.id}/edit`}
                          className="rounded-lg border border-neutral-300 bg-white px-3 py-1 text-xs font-bold text-neutral-800 shadow-2xs hover:bg-neutral-50 hover:border-neutral-400 transition-colors"
                        >
                          Edit
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
