"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { friendlyErrorMessage } from "@vsolve/query";
import { Badge, Button, Card, ConfirmAction, EmptyState, Skeleton, formatMoney, useToast } from "@vsolve/ui";
import { EyeOff, MapPin, Package, Pencil, Plus, Send, Trash2, Eye } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { canSubmitAsset } from "@/features/rentals/booking-actions";
import {
  deletePartnerRentalAsset,
  fetchPartnerDefaultLocation,
  fetchPartnerRentalAssets,
  fetchRentalTaxonomy,
  partnerRentalAssetAction,
  type PartnerRentalAsset,
} from "@/features/rentals/queries";
import { PickupHoursCard } from "@/features/rentals/view/pickup-hours-card";
import { RentalAdEditor } from "@/features/rentals/view/rental-ad-editor";
import { RENTAL_SECTIONS } from "@/features/rentals/view/rental-sections";
import { SectionNav } from "@/features/workspace/view/section-nav";

type Tone = "success" | "warning" | "danger" | "info" | "neutral";
type Group = "live" | "unavailable" | "review" | "draft" | "attention";

const STATUS: Record<string, { label: string; hint: string; tone: Tone; group: Group }> = {
  PUBLISHED: { label: "Live", hint: "Customers can see and book this.", tone: "success", group: "live" },
  PAUSED: {
    label: "Unavailable",
    hint: "Hidden from customers. Bookings already made still go ahead.",
    tone: "warning",
    group: "unavailable",
  },
  PENDING_REVIEW: {
    label: "Under review",
    hint: "We are checking it. It goes live once approved.",
    tone: "info",
    group: "review",
  },
  DRAFT: { label: "Draft", hint: "Not sent for review yet.", tone: "neutral", group: "draft" },
  REJECTED: {
    label: "Changes needed",
    hint: "Not approved. Edit it, then send it for review again.",
    tone: "danger",
    group: "attention",
  },
  REMOVED: {
    label: "Removed",
    hint: "Taken down by vSolve. Contact support to bring it back.",
    tone: "danger",
    group: "attention",
  },
};

function statusOf(asset: PartnerRentalAsset) {
  return STATUS[asset.public_state] ?? STATUS.DRAFT!;
}

const FILTERS: Array<{ key: "all" | Group; label: string }> = [
  { key: "all", label: "All" },
  { key: "live", label: "Live" },
  { key: "unavailable", label: "Unavailable" },
  { key: "review", label: "Under review" },
  { key: "draft", label: "Drafts" },
  { key: "attention", label: "Needs attention" },
];

type AssetAction = "submit" | "pause" | "resume";

const ACTION_DONE: Record<AssetAction, string> = {
  submit: "Sent for review.",
  pause: "Marked unavailable. Customers can’t book it now.",
  resume: "Available again. Customers can book it.",
};

/**
 * The partner's rental items.
 *
 * The list is the page: every item shows its status in plain words and the
 * one or two things the partner can do from there (mark unavailable, make
 * available, send for review, edit, delete). Adding or editing an item opens
 * a side sheet, so the form is never in the way of the list.
 */
export function PartnerRentalsWorkspace() {
  const qc = useQueryClient();
  const { notify } = useToast();
  const [editor, setEditor] = useState<{ key: number; asset: PartnerRentalAsset | null } | null>(null);
  const [filter, setFilter] = useState<"all" | Group>("all");
  const [toDelete, setToDelete] = useState<PartnerRentalAsset | null>(null);
  const [defaultLocation, setDefaultLocation] = useState("");

  const taxonomy = useQuery({ queryKey: ["partner-rentals", "taxonomy"], queryFn: fetchRentalTaxonomy });
  const assets = useQuery({ queryKey: ["partner-rentals", "assets"], queryFn: fetchPartnerRentalAssets });

  // "Add an item" on the home links here with ?add=1 and opens the form straight away.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("add") !== "1") return;
    window.history.replaceState(null, "", window.location.pathname);
    setEditor({ key: Date.now(), asset: null });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchPartnerDefaultLocation().then((loc) => {
      if (!cancelled) setDefaultLocation(loc);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["partner-rentals"] });

  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: AssetAction }) => partnerRentalAssetAction(id, action),
    onSuccess: (_data, { action }) => {
      notify(ACTION_DONE[action], "success");
      invalidate();
    },
    onError: (err: unknown) => notify(friendlyErrorMessage(err), "danger"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deletePartnerRentalAsset(id),
    onSuccess: () => {
      notify("Item deleted.", "success");
      setToDelete(null);
      invalidate();
    },
    onError: (err: unknown) => notify(friendlyErrorMessage(err), "danger"),
  });

  const items = (assets.data ?? []).filter((a) => a.public_state !== "RETIRED");
  const counts = items.reduce<Record<string, number>>((acc, a) => {
    const g = statusOf(a).group;
    acc[g] = (acc[g] ?? 0) + 1;
    return acc;
  }, {});
  const totals = items
    .filter((a) => a.public_state === "PUBLISHED")
    .reduce(
      (acc, a) => ({
        pieces: acc.pieces + a.quantity_available,
        booked: acc.booked + a.booked_now,
        available: acc.available + a.available_now,
      }),
      { pieces: 0, booked: 0, available: 0 },
    );
  const visible = filter === "all" ? items : items.filter((a) => statusOf(a).group === filter);
  const openNew = () => setEditor({ key: Date.now(), asset: null });

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-action">Rentals</p>
          <h1 className="mt-1 text-2xl font-extrabold text-navy-900">Your rental items</h1>
          <p className="mt-1 text-sm text-text-secondary">
            See what is live, hide an item when it is not available, and keep details up to date.
          </p>
        </div>
        <Button onClick={openNew} disabled={!taxonomy.data}>
          <Plus className="size-4" />
          Add an item
        </Button>
      </div>

      <SectionNav label="Rental sections" items={RENTAL_SECTIONS} />

      <PickupHoursCard />

      {totals.pieces > 0 ? (
        <div className="grid grid-cols-3 gap-3">
          <Tally label="Live pieces" value={totals.pieces} />
          <Tally label="Booked now" value={totals.booked} tone="booked" />
          <Tally label="Available now" value={totals.available} tone="free" />
        </div>
      ) : null}

      {items.length > 0 ? (
        <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Filter items">
          {FILTERS.filter((f) => f.key === "all" || (counts[f.key] ?? 0) > 0).map((f) => {
            const count = f.key === "all" ? items.length : counts[f.key] ?? 0;
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(f.key)}
                className={
                  active
                    ? "shrink-0 rounded-full bg-navy-900 px-3.5 py-1.5 text-sm font-semibold text-white"
                    : "shrink-0 rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm font-semibold text-text-secondary hover:border-navy-700 hover:text-navy-900"
                }
              >
                {f.label} <span className={active ? "text-white/70" : "text-text-muted"}>{count}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {assets.isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-72 rounded-card" />
          ))}
        </div>
      ) : null}
      {assets.error ? <p className="text-sm text-danger-text">{friendlyErrorMessage(assets.error)}</p> : null}

      {assets.data && items.length === 0 ? (
        <Card padding="lg" className="flex flex-col items-center gap-3 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-navy-50 text-navy-700">
            <Package className="size-6" />
          </span>
          <div>
            <p className="font-bold text-navy-900">No items yet</p>
            <p className="mt-1 text-sm text-text-secondary">
              Add your first item with a few photos and a daily price. We check it, then customers can book it.
            </p>
          </div>
          <Button onClick={openNew} disabled={!taxonomy.data}>
            <Plus className="size-4" />
            Add an item
          </Button>
        </Card>
      ) : null}

      {items.length > 0 && visible.length === 0 ? (
        <EmptyState compact title="Nothing here" description="No items match this filter." />
      ) : null}

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((asset) => (
          <li key={asset.id}>
            <ItemCard
              asset={asset}
              busy={(act.isPending && act.variables?.id === asset.id) || (remove.isPending && remove.variables === asset.id)}
              onAction={(action) => act.mutate({ id: asset.id, action })}
              onEdit={() => setEditor({ key: Date.now(), asset })}
              onDelete={() => setToDelete(asset)}
            />
          </li>
        ))}
      </ul>

      {editor ? (
        <RentalAdEditor
          key={editor.key}
          asset={editor.asset}
          taxonomy={taxonomy.data ?? []}
          defaultLocation={defaultLocation}
          onClose={() => setEditor(null)}
          onSaved={invalidate}
        />
      ) : null}

      <ConfirmAction
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open) setToDelete(null);
        }}
        title="Delete this item?"
        consequence={`“${toDelete?.title ?? ""}” will be removed from your list and customers won’t see it. Bookings already made are not affected. To hide it for a while instead, mark it unavailable.`}
        confirmLabel="Delete item"
        destructive
        pending={remove.isPending}
        onConfirm={() => {
          if (toDelete) remove.mutate(toDelete.id);
        }}
      />
    </div>
  );
}

function ItemCard({
  asset,
  busy,
  onAction,
  onEdit,
  onDelete,
}: {
  asset: PartnerRentalAsset;
  busy: boolean;
  onAction: (action: AssetAction) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const status = statusOf(asset);
  const cover = asset.media?.[0];
  const coverUrl = cover ? cover.image_url || cover.url : undefined;
  const removed = asset.public_state === "REMOVED";
  const canPause = asset.moderation_status === "APPROVED" && asset.public_state === "PUBLISHED";
  const canResume = asset.moderation_status === "PAUSED";
  const canSubmit = canSubmitAsset(asset.moderation_status);
  const fullyBooked = asset.public_state === "PUBLISHED" && asset.available_now === 0;
  const hint = fullyBooked ? "Every piece is booked right now. New bookings can still be made for later dates." : status.hint;

  return (
    <Card padding="none" className="flex h-full flex-col overflow-hidden">
      <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden bg-surface-sunken">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverUrl}
            alt=""
            className={canResume || removed
                ? "absolute inset-0 size-full object-cover opacity-60 grayscale"
                : "absolute inset-0 size-full object-cover"}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-text-muted">No photo</div>
        )}
        <div className="absolute left-2 top-2">
          <Badge tone={status.tone} dot>
            {status.label}
          </Badge>
        </div>
        {(asset.media?.length ?? 0) > 1 ? (
          <span className="absolute bottom-2 right-2 rounded-control bg-navy-900/75 px-1.5 py-0.5 text-[11px] font-semibold text-white">
            {asset.media.length} photos
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <p className="line-clamp-2 font-semibold text-navy-900">{asset.title}</p>
        <p className="text-sm">
          <span className="font-extrabold text-navy-900">{formatMoney(asset.daily_rate_paise)}</span>
          <span className="text-text-secondary"> / day · Deposit {formatMoney(asset.deposit_paise)}</span>
        </p>
        {asset.location_text ? (
          <p className="inline-flex items-center gap-1 text-xs text-text-secondary">
            <MapPin className="size-3 shrink-0" />
            <span className="line-clamp-1">{asset.location_text}</span>
          </p>
        ) : null}

        <dl className="mt-1 grid grid-cols-3 divide-x divide-line overflow-hidden rounded-control border border-line text-center">
          <StockCell label="Total" value={asset.quantity_available} />
          <StockCell label="Booked" value={asset.booked_now} tone={asset.booked_now > 0 ? "booked" : undefined} />
          <StockCell
            label="Available"
            value={asset.available_now}
            tone={asset.available_now > 0 ? "free" : "none"}
          />
        </dl>
        {asset.upcoming_bookings > 0 ? (
          <Link href="/rentals/bookings" className="text-xs font-semibold text-text-link hover:underline">
            {asset.upcoming_bookings} upcoming {asset.upcoming_bookings === 1 ? "booking" : "bookings"} →
          </Link>
        ) : null}
        <p className="rounded-control bg-surface-sunken px-2.5 py-1.5 text-xs text-text-secondary">{hint}</p>

        <div className="mt-auto flex flex-col gap-2 pt-2">
          {canPause ? (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => onAction("pause")}>
              <EyeOff className="size-4" />
              Mark unavailable
            </Button>
          ) : null}
          {canResume ? (
            <Button size="sm" disabled={busy} onClick={() => onAction("resume")}>
              <Eye className="size-4" />
              Make available
            </Button>
          ) : null}
          {canSubmit ? (
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => onAction("submit")}>
              <Send className="size-4" />
              Send for review
            </Button>
          ) : null}
          <div className="flex gap-2">
            {removed ? null : (
              <Button size="sm" variant="ghost" className="flex-1" disabled={busy} onClick={onEdit}>
                <Pencil className="size-4" />
                Edit
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="flex-1 text-danger-text"
              disabled={busy}
              onClick={onDelete}
            >
              <Trash2 className="size-4" />
              Delete
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

type StockTone = "booked" | "free" | "none";

const STOCK_TONE: Record<StockTone, string> = {
  booked: "text-warning-text",
  free: "text-success-text",
  none: "text-danger-text",
};

function StockCell({ label, value, tone }: { label: string; value: number; tone?: StockTone }) {
  return (
    <div className="px-2 py-1.5">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">{label}</dt>
      <dd className={`text-base font-extrabold ${tone ? STOCK_TONE[tone] : "text-navy-900"}`}>{value}</dd>
    </div>
  );
}

function Tally({ label, value, tone }: { label: string; value: number; tone?: "booked" | "free" }) {
  return (
    <Card padding="none" className="px-4 py-3">
      <p className="text-xs font-semibold text-text-muted">{label}</p>
      <p className={`mt-0.5 text-2xl font-extrabold ${tone ? STOCK_TONE[tone] : "text-navy-900"}`}>{value}</p>
    </Card>
  );
}
