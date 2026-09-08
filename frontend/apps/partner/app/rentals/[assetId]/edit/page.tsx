"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Wrench,
  Camera,
  Plus,
  Image as ImageIcon,
  Clock,
} from "lucide-react";

import {
  usePartnerRentalAsset,
  useUpdateRentalAsset,
  usePartnerAssetMaintenance,
  useAddAssetMaintenance,
  usePartnerAssetMedia,
  useAddAssetMedia,
  type RentalAsset,
  type RentalAssetInput,
  type RentalAssetStatus,
  type RentalConditionGrade,
} from "@/features/rentals/queries";

const CONDITION_GRADES: RentalConditionGrade[] = ["EXCELLENT", "GOOD", "FAIR"];
const STATUSES: RentalAssetStatus[] = ["ACTIVE", "UNDER_MAINTENANCE", "RETIRED"];

type EditableFields = Pick<
  RentalAssetInput,
  "daily_price_paise" | "deposit_paise" | "condition_grade" | "current_status"
>;

export default function EditRentalAssetPage() {
  const params = useParams<{ assetId: string }>();
  const { data: asset, isLoading, isError } = usePartnerRentalAsset(params.assetId);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-neutral-50 pb-20 pt-6">
        <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 text-sm text-neutral-500">
          Loading asset…
        </div>
      </div>
    );
  }

  if (isError || !asset) {
    return (
      <div className="min-h-screen bg-neutral-50 pb-20 pt-6">
        <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
          <Link href="/rentals" className="flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900">
            <ArrowLeft className="h-4 w-4" /> Back to Inventory
          </Link>
          <p className="mt-6 flex items-center gap-2 text-sm text-red-600">
            <AlertCircle className="h-4 w-4" /> Could not load this asset. It may not exist, or may
            belong to another vendor.
          </p>
        </div>
      </div>
    );
  }

  return <EditRentalAssetForm key={asset.id} asset={asset} />;
}

function EditRentalAssetForm({ asset }: { asset: RentalAsset }) {
  const router = useRouter();
  const updateAsset = useUpdateRentalAsset();

  const [form, setForm] = useState<EditableFields>({
    daily_price_paise: asset.daily_price_paise,
    deposit_paise: asset.deposit_paise,
    condition_grade: asset.condition_grade as RentalConditionGrade,
    current_status: asset.current_status as RentalAssetStatus,
  });
  const [saved, setSaved] = useState(false);

  // Maintenance form state
  const { data: maintenancePeriods, isLoading: loadingMaint } = usePartnerAssetMaintenance(asset.id);
  const addMaintenance = useAddAssetMaintenance();
  const [maintStart, setMaintStart] = useState("");
  const [maintEnd, setMaintEnd] = useState("");
  const [maintReason, setMaintReason] = useState("");

  // Media form state
  const { data: mediaItems, isLoading: loadingMedia } = usePartnerAssetMedia(asset.id);
  const addMedia = useAddAssetMedia();
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaCaption, setMediaCaption] = useState("");
  const [mediaIsPrimary, setMediaIsPrimary] = useState(false);

  function update<K extends keyof EditableFields>(key: K, value: EditableFields[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await updateAsset.mutateAsync({ id: asset.id, patch: form });
    setSaved(true);
  }

  async function handleAddMaintenance(e: React.FormEvent) {
    e.preventDefault();
    if (!maintStart || !maintEnd) return;
    await addMaintenance.mutateAsync({
      assetId: asset.id,
      start_date: maintStart,
      end_date: maintEnd,
      reason: maintReason,
    });
    setMaintStart("");
    setMaintEnd("");
    setMaintReason("");
  }

  async function handleAddMedia(e: React.FormEvent) {
    e.preventDefault();
    if (!mediaUrl.trim()) return;
    await addMedia.mutateAsync({
      assetId: asset.id,
      url: mediaUrl.trim(),
      caption: mediaCaption.trim(),
      is_primary: mediaIsPrimary,
    });
    setMediaUrl("");
    setMediaCaption("");
    setMediaIsPrimary(false);
  }

  return (
    <div className="min-h-screen bg-neutral-50 pb-20 pt-6">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="flex items-center gap-2 text-sm text-neutral-500">
          <Link href="/rentals" className="flex items-center gap-1 hover:text-neutral-900">
            <ArrowLeft className="h-4 w-4" /> Back to Inventory
          </Link>
        </div>

        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-neutral-900">{asset.title}</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {asset.is_serialized ? `Serial: ${asset.asset_identifier || "—"}` : `Pooled · ${asset.quantity_available} units`}
          </p>
        </div>

        {/* Pricing & Status Configuration Form */}
        <form onSubmit={handleSubmit} className="space-y-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-bold text-neutral-900">Pricing & Asset Status</h2>
          <p className="text-xs text-neutral-500">
            Title, product type and tracking mode are fixed once listed.
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase text-neutral-500">
                Daily rate (₹)
              </label>
              <input
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

          <div className="grid grid-cols-2 gap-4">
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
            <div>
              <label className="block text-xs font-bold uppercase text-neutral-500">
                Listing status
              </label>
              <select
                value={form.current_status}
                onChange={(e) => update("current_status", e.target.value as RentalAssetStatus)}
                className="mt-1 w-full rounded-lg border border-neutral-300 p-2.5 text-sm focus:border-action focus:outline-none"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {updateAsset.isError && (
            <p className="flex items-center gap-1 text-xs text-red-600">
              <AlertCircle className="h-3.5 w-3.5" />
              {updateAsset.error instanceof Error ? updateAsset.error.message : "Failed to save changes."}
            </p>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            {saved && !updateAsset.isPending && (
              <span className="flex items-center gap-1 text-xs font-semibold text-emerald-700">
                <CheckCircle2 className="h-4 w-4" /> Saved
              </span>
            )}
            <button
              type="submit"
              disabled={updateAsset.isPending}
              className="rounded-lg bg-action px-5 py-2 text-xs font-bold text-white hover:bg-[#d65f1a] disabled:opacity-50 cursor-pointer"
            >
              {updateAsset.isPending ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>

        {/* Maintenance Schedule Section */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-base font-bold text-neutral-900">
                <Wrench className="h-4 w-4 text-action" /> Maintenance Downtime Periods
              </h2>
              <p className="text-xs text-neutral-500 mt-0.5">
                Block calendar availability for scheduled service, repair, or recalibration.
              </p>
            </div>
          </div>

          {/* List existing maintenance periods */}
          {loadingMaint ? (
            <p className="text-xs text-neutral-400">Loading maintenance schedule...</p>
          ) : !maintenancePeriods || maintenancePeriods.length === 0 ? (
            <p className="text-xs text-neutral-500 bg-neutral-50 p-4 rounded-xl border border-neutral-100">
              No maintenance downtime scheduled. Asset is available for bookings.
            </p>
          ) : (
            <div className="space-y-2">
              {maintenancePeriods.map((mp) => (
                <div key={mp.id} className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-xs">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-amber-700 shrink-0" />
                    <div>
                      <span className="font-bold text-amber-900">{mp.start_date} → {mp.end_date}</span>
                      {mp.reason && <p className="text-amber-800 text-[11px] mt-0.5">{mp.reason}</p>}
                    </div>
                  </div>
                  <span className="rounded-md bg-amber-200/70 px-2 py-0.5 text-[10px] font-bold text-amber-900 uppercase">
                    Blocked
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Add Maintenance Form */}
          <form onSubmit={handleAddMaintenance} className="border-t border-neutral-100 pt-4 space-y-3">
            <span className="block text-xs font-bold text-neutral-800">Schedule New Maintenance Window</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-neutral-500">Start Date</label>
                <input
                  type="date"
                  required
                  value={maintStart}
                  onChange={(e) => setMaintStart(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-neutral-300 p-2 text-xs focus:border-action focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-neutral-500">End Date</label>
                <input
                  type="date"
                  required
                  min={maintStart}
                  value={maintEnd}
                  onChange={(e) => setMaintEnd(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-neutral-300 p-2 text-xs focus:border-action focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-neutral-500">Reason / Description</label>
              <input
                type="text"
                placeholder="e.g. Engine tune-up, hydraulic seal replacement"
                value={maintReason}
                onChange={(e) => setMaintReason(e.target.value)}
                className="mt-1 w-full rounded-lg border border-neutral-300 p-2 text-xs focus:border-action focus:outline-none"
              />
            </div>
            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={addMaintenance.isPending || !maintStart || !maintEnd}
                className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-4 py-2 text-xs font-bold text-white hover:bg-neutral-800 disabled:opacity-50 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" /> Block Dates for Maintenance
              </button>
            </div>
          </form>
        </div>

        {/* Condition Photos & Media Section */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm space-y-6">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-neutral-900">
              <Camera className="h-4 w-4 text-action" /> Condition Photos & Visual Media
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Visual records of unit condition shown in customer storefront and used for handover verification.
            </p>
          </div>

          {/* List existing media */}
          {loadingMedia ? (
            <p className="text-xs text-neutral-400">Loading asset photos...</p>
          ) : !mediaItems || mediaItems.length === 0 ? (
            <p className="text-xs text-neutral-500 bg-neutral-50 p-4 rounded-xl border border-neutral-100">
              No photos uploaded yet. Add image URLs to showcase this unit to customers.
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {mediaItems.map((media) => (
                <div key={media.id} className="relative rounded-xl border border-neutral-200 overflow-hidden bg-neutral-100 group">
                  <img src={media.url} alt={media.caption || "Asset photo"} className="h-28 w-full object-cover" />
                  {media.is_primary && (
                    <span className="absolute top-1.5 left-1.5 rounded bg-action px-1.5 py-0.5 text-[9px] font-bold text-white uppercase">
                      Primary
                    </span>
                  )}
                  {media.caption && (
                    <div className="p-2 text-[10px] text-neutral-600 truncate">{media.caption}</div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Add Media Form */}
          <form onSubmit={handleAddMedia} className="border-t border-neutral-100 pt-4 space-y-3">
            <span className="block text-xs font-bold text-neutral-800">Add Image URL</span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-medium text-neutral-500">Image Web URL</label>
                <input
                  type="url"
                  required
                  placeholder="https://..."
                  value={mediaUrl}
                  onChange={(e) => setMediaUrl(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-neutral-300 p-2 text-xs focus:border-action focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-neutral-500">Caption</label>
                <input
                  type="text"
                  placeholder="e.g. Front view"
                  value={mediaCaption}
                  onChange={(e) => setMediaCaption(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-neutral-300 p-2 text-xs focus:border-action focus:outline-none"
                />
              </div>
            </div>
            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 text-xs text-neutral-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={mediaIsPrimary}
                  onChange={(e) => setMediaIsPrimary(e.target.checked)}
                  className="rounded border-neutral-300 text-action focus:ring-action"
                />
                <span>Set as primary storefront display photo</span>
              </label>
              <button
                type="submit"
                disabled={addMedia.isPending || !mediaUrl.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-4 py-2 text-xs font-bold text-white hover:bg-neutral-800 disabled:opacity-50 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" /> Add Image
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
