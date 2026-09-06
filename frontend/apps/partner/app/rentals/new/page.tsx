"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, AlertCircle } from "lucide-react";

import {
  useCreateRentalAsset,
  useRentalVariantOptions,
  type RentalAssetInput,
  type RentalConditionGrade,
} from "@/features/rentals/queries";

const CONDITION_GRADES: RentalConditionGrade[] = ["EXCELLENT", "GOOD", "FAIR"];

export default function NewRentalAssetPage() {
  const router = useRouter();
  const { data: variants, isLoading: variantsLoading } = useRentalVariantOptions();
  const createAsset = useCreateRentalAsset();

  const [form, setForm] = useState<Omit<RentalAssetInput, "current_status">>({
    variant_id: "",
    title: "",
    description: "",
    asset_identifier: "",
    is_serialized: true,
    quantity_available: 1,
    daily_price_paise: 0,
    deposit_paise: 0,
    condition_grade: "EXCELLENT",
  });

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const asset = await createAsset.mutateAsync({ ...form, current_status: "ACTIVE" });
    router.push(`/rentals/${asset.id}/edit`);
  }

  const canSubmit = form.variant_id && form.title.trim() && form.daily_price_paise > 0;

  return (
    <div className="min-h-screen bg-neutral-50 pb-20 pt-6">
      <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-2 text-sm text-neutral-500">
          <Link href="/rentals" className="flex items-center gap-1 hover:text-neutral-900">
            <ArrowLeft className="h-4 w-4" /> Back to Inventory
          </Link>
        </div>

        <h1 className="text-2xl sm:text-3xl font-black text-neutral-900">List a New Rental Item</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Pick the product type customers browse under, then set your pricing and stock.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div>
            <label className="block text-xs font-bold uppercase text-neutral-500">Product type</label>
            {variantsLoading ? (
              <div className="mt-1 text-sm text-neutral-500">Loading categories...</div>
            ) : (
              <select
                required
                value={form.variant_id}
                onChange={(e) => update("variant_id", e.target.value)}
                className="mt-1 w-full rounded-lg border border-neutral-300 p-2.5 text-sm focus:border-action focus:outline-none"
              >
                <option value="" disabled>
                  Select a product type…
                </option>
                {(variants ?? []).map((v) => (
                  <option key={v.variant_id} value={v.variant_id}>
                    {v.category_name} → {v.subcategory_name} → {v.service_name}
                    {v.variant_name && v.variant_name !== v.service_name ? ` (${v.variant_name})` : ""}
                  </option>
                ))}
              </select>
            )}
            {!variantsLoading && (variants ?? []).length === 0 && (
              <p className="mt-1 flex items-center gap-1 text-xs text-amber-700">
                <AlertCircle className="h-3.5 w-3.5" /> No rental product types are configured yet —
                contact support to get your category added.
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-neutral-500">Title</label>
            <input
              required
              type="text"
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
              placeholder="e.g. Bosch Professional Hammer Drill (500W)"
              className="mt-1 w-full rounded-lg border border-neutral-300 p-2.5 text-sm focus:border-action focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-neutral-500">Description</label>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-300 p-2.5 text-sm focus:border-action focus:outline-none"
            />
          </div>

          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
            <label className="block text-xs font-bold uppercase text-neutral-500 mb-2">
              Tracking mode
            </label>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={form.is_serialized}
                  onChange={() => update("is_serialized", true)}
                />
                Serialized — one specific unit (e.g. a single drill)
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={!form.is_serialized}
                  onChange={() => update("is_serialized", false)}
                />
                Pooled — interchangeable quantity (e.g. 50 chairs)
              </label>
            </div>

            {form.is_serialized ? (
              <div className="mt-3">
                <label className="block text-xs font-semibold text-neutral-700">
                  Serial / identifier
                </label>
                <input
                  type="text"
                  value={form.asset_identifier}
                  onChange={(e) => update("asset_identifier", e.target.value)}
                  placeholder="e.g. BOSCH-HD-8841"
                  className="mt-1 w-full rounded-lg border border-neutral-300 p-2 text-sm focus:border-action focus:outline-none"
                />
              </div>
            ) : (
              <div className="mt-3">
                <label className="block text-xs font-semibold text-neutral-700">
                  Quantity available
                </label>
                <input
                  type="number"
                  min={1}
                  value={form.quantity_available}
                  onChange={(e) => update("quantity_available", Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-neutral-300 p-2 text-sm focus:border-action focus:outline-none"
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase text-neutral-500">
                Daily rate (₹)
              </label>
              <input
                required
                type="number"
                min={0}
                value={form.daily_price_paise / 100}
                onChange={(e) => update("daily_price_paise", Math.round(Number(e.target.value) * 100))}
                className="mt-1 w-full rounded-lg border border-neutral-300 p-2.5 text-sm focus:border-action focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-neutral-500">
                Security deposit (₹)
              </label>
              <input
                type="number"
                min={0}
                value={form.deposit_paise / 100}
                onChange={(e) => update("deposit_paise", Math.round(Number(e.target.value) * 100))}
                className="mt-1 w-full rounded-lg border border-neutral-300 p-2.5 text-sm focus:border-action focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-neutral-500">
              Condition grade
            </label>
            <select
              value={form.condition_grade}
              onChange={(e) => update("condition_grade", e.target.value as RentalConditionGrade)}
              className="mt-1 w-full rounded-lg border border-neutral-300 p-2.5 text-sm focus:border-action focus:outline-none"
            >
              {CONDITION_GRADES.map((grade) => (
                <option key={grade} value={grade}>
                  {grade.charAt(0) + grade.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </div>

          {createAsset.isError && (
            <p className="flex items-center gap-1 text-xs text-red-600">
              <AlertCircle className="h-3.5 w-3.5" />
              {createAsset.error instanceof Error ? createAsset.error.message : "Failed to list item."}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Link
              href="/rentals"
              className="rounded-lg px-4 py-2 text-xs font-semibold text-neutral-600 hover:bg-neutral-100"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={!canSubmit || createAsset.isPending}
              className="rounded-lg bg-action px-5 py-2 text-xs font-bold text-white hover:bg-[#d65f1a] disabled:opacity-50"
            >
              {createAsset.isPending ? "Listing…" : "List Item"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
