"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { usePagedList } from "@vsolve/query";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  LoadMore,
  Textarea,
  formatDate,
  formatMoney,
} from "@vsolve/ui";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Eye,
  Layers,
  Package,
  PowerOff,
  RefreshCw,
  Search,
  Truck,
  User,
  X,
} from "lucide-react";

import {
  fetchOpsRentalsPage,
  moderateOpsRental,
  type ModerationAction,
  type OpsRentalAsset,
} from "./queries";
import { PartnerProfileDrawer } from "./partner-profile-drawer";
import { RentalPlatformFeeForm } from "./rental-platform-fee";
import { RentalDisputeQueue } from "./rental-disputes";
import { useDebounced } from "@/features/shared/use-debounced";

type StatusFilter = "ALL" | "ACTIVE" | "PAUSED" | "REMOVED" | "PENDING";

const ACTION_COPY: Record<
  ModerationAction,
  { title: string; description: string; confirm: string; danger: boolean }
> = {
  APPROVE: {
    title: "Approve this rental asset",
    description: "It becomes visible to customers in the marketplace.",
    confirm: "Approve",
    danger: false,
  },
  REJECT: {
    title: "Reject this rental asset",
    description: "It stays off the marketplace. The partner can make corrections.",
    confirm: "Reject",
    danger: true,
  },
  REMOVE: {
    title: "Turn off / Take down listing",
    description: "Customers will immediately stop seeing this item on the marketplace.",
    confirm: "Turn Off Listing",
    danger: true,
  },
  REINSTATE: {
    title: "Reinstate rental listing",
    description: "This item will be turned back on and visible to customers.",
    confirm: "Reinstate Listing",
    danger: false,
  },
};

function statusBadge(item: OpsRentalAsset) {
  if (item.moderation_status === "APPROVED" || item.public_state === "PUBLISHED") {
    return <Badge tone="success">Live</Badge>;
  }
  if (item.moderation_status === "PAUSED" || item.public_state === "PAUSED") {
    return <Badge tone="warning">Paused</Badge>;
  }
  if (item.moderation_status === "REMOVED" || item.public_state === "REMOVED") {
    return <Badge tone="danger">Taken Down</Badge>;
  }
  if (item.moderation_status === "PENDING" || item.public_state === "PENDING_REVIEW") {
    return <Badge tone="neutral">Pending</Badge>;
  }
  if (item.moderation_status === "REJECTED") {
    return <Badge tone="danger">Rejected</Badge>;
  }
  return <Badge tone="neutral">{String(item.moderation_status || item.public_state || "Unknown").replace(/_/g, " ")}</Badge>;
}

export function RentalsOperationsWorkspace() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<StatusFilter>("ALL");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search.trim().toLowerCase());

  // Inspections and Modals
  const [inspectItem, setInspectItem] = useState<OpsRentalAsset | null>(null);
  const [selectedPartner, setSelectedPartner] = useState<{
    id: string | null;
    name?: string;
    phone?: string;
  } | null>(null);
  const [decision, setDecision] = useState<{
    item: OpsRentalAsset;
    action: ModerationAction;
  } | null>(null);
  const [decisionReason, setDecisionReason] = useState("");
  const [showSecondaryTools, setShowSecondaryTools] = useState(false);

  // Fetch items from ops endpoint
  const query = usePagedList(["ops-rentals", filter === "PENDING" ? "PENDING" : undefined], (cursor) =>
    fetchOpsRentalsPage(cursor, filter === "PENDING" ? "PENDING" : undefined),
  );

  const moderateMutation = useMutation({
    mutationFn: ({
      id,
      action,
      reason,
    }: {
      id: string;
      action: ModerationAction;
      reason: string;
    }) => moderateOpsRental(id, action, reason),
    onSuccess: () => {
      setDecision(null);
      setDecisionReason("");
      void qc.invalidateQueries({ queryKey: ["ops-rentals"] });
    },
  });

  // Client-side filtering across the loaded batch
  const filteredItems = useMemo(() => {
    return query.items.filter((item) => {
      // Status filtering
      const isPending =
        item.moderation_status === "PENDING" || item.public_state === "PENDING_REVIEW";
      const isRemoved =
        item.moderation_status === "REMOVED" || item.public_state === "REMOVED";
      const isPaused = item.moderation_status === "PAUSED" || item.public_state === "PAUSED";
      const isLive =
        (item.moderation_status === "APPROVED" || item.current_status === "ACTIVE") &&
        !isPaused &&
        !isRemoved;

      if (filter === "ACTIVE" && !isLive) return false;
      if (filter === "PAUSED" && !isPaused) return false;
      if (filter === "REMOVED" && !isRemoved) return false;
      if (filter === "PENDING" && !isPending) return false;

      // Text search
      if (debouncedSearch) {
        const titleMatch = item.title?.toLowerCase().includes(debouncedSearch);
        const partnerMatch = item.partner_name?.toLowerCase().includes(debouncedSearch);
        const locMatch =
          item.location_text?.toLowerCase().includes(debouncedSearch) ||
          item.pickup_city?.toLowerCase().includes(debouncedSearch);
        if (!titleMatch && !partnerMatch && !locMatch) return false;
      }

      return true;
    });
  }, [query.items, filter, debouncedSearch]);

  // Metrics computation across loaded items
  const counts = useMemo(() => {
    let live = 0;
    let paused = 0;
    let removed = 0;
    let pending = 0;
    for (const item of query.items) {
      if (item.moderation_status === "REMOVED" || item.public_state === "REMOVED") removed++;
      else if (item.moderation_status === "PAUSED" || item.public_state === "PAUSED") paused++;
      else if (item.moderation_status === "PENDING" || item.public_state === "PENDING_REVIEW") pending++;
      else live++;
    }
    return { total: query.items.length, live, paused, removed, pending };
  }, [query.items]);

  const openDecision = (item: OpsRentalAsset, action: ModerationAction) => {
    setDecisionReason("");
    moderateMutation.reset();
    setDecision({ item, action });
  };

  const copy = decision ? ACTION_COPY[decision.action] : null;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Package className="size-6 text-brand-600" />
            <h1 className="text-2xl font-bold text-navy-900">Rentals Management</h1>
          </div>
          <p className="mt-1 text-sm text-text-secondary">
            Manage all rental items, turn listings off or reinstate them, inspect posters, and enforce operational compliance.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowSecondaryTools((prev) => !prev)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-text hover:bg-surface-sunken"
        >
          <Layers className="size-4 text-text-muted" />
          {showSecondaryTools ? "Hide Platform Fees & Disputes" : "Platform Fees & Disputes"}
          {showSecondaryTools ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        </button>
      </div>

      {/* Collapsible Secondary Tools */}
      {showSecondaryTools && (
        <div className="space-y-4 rounded-xl border border-line bg-surface-sunken/40 p-4">
          <RentalPlatformFeeForm />
          <RentalDisputeQueue />
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <button
          type="button"
          onClick={() => setFilter("ALL")}
          className={`flex flex-col rounded-xl border p-3 text-left transition ${
            filter === "ALL" ? "border-brand-500 bg-brand-50/50 shadow-sm" : "border-line bg-surface hover:bg-surface-sunken"
          }`}
        >
          <span className="text-xs font-medium text-text-secondary">Total Listings</span>
          <span className="mt-1 text-xl font-bold text-navy-900">{counts.total}</span>
        </button>

        <button
          type="button"
          onClick={() => setFilter("ACTIVE")}
          className={`flex flex-col rounded-xl border p-3 text-left transition ${
            filter === "ACTIVE" ? "border-success-500 bg-success-50/50 shadow-sm" : "border-line bg-surface hover:bg-surface-sunken"
          }`}
        >
          <span className="text-xs font-medium text-success-700">Live / Active</span>
          <span className="mt-1 text-xl font-bold text-navy-900">{counts.live}</span>
        </button>

        <button
          type="button"
          onClick={() => setFilter("PAUSED")}
          className={`flex flex-col rounded-xl border p-3 text-left transition ${
            filter === "PAUSED" ? "border-warning-500 bg-warning-50/50 shadow-sm" : "border-line bg-surface hover:bg-surface-sunken"
          }`}
        >
          <span className="text-xs font-medium text-warning-700">Paused (Host)</span>
          <span className="mt-1 text-xl font-bold text-navy-900">{counts.paused}</span>
        </button>

        <button
          type="button"
          onClick={() => setFilter("REMOVED")}
          className={`flex flex-col rounded-xl border p-3 text-left transition ${
            filter === "REMOVED" ? "border-danger-500 bg-danger-50/50 shadow-sm" : "border-line bg-surface hover:bg-surface-sunken"
          }`}
        >
          <span className="text-xs font-medium text-danger-700">Turned Off (Admin)</span>
          <span className="mt-1 text-xl font-bold text-navy-900">{counts.removed}</span>
        </button>

        <button
          type="button"
          onClick={() => setFilter("PENDING")}
          className={`flex flex-col rounded-xl border p-3 text-left transition ${
            filter === "PENDING" ? "border-brand-500 bg-brand-50/50 shadow-sm" : "border-line bg-surface hover:bg-surface-sunken"
          }`}
        >
          <span className="text-xs font-medium text-text-secondary">Pending Decision</span>
          <span className="mt-1 text-xl font-bold text-navy-900">{counts.pending}</span>
        </button>
      </div>

      {/* Search and Filters Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by rental item title, partner name, city..."
            className="w-full rounded-xl border border-line bg-surface py-2 pl-9 pr-4 text-sm text-navy-900 placeholder:text-text-muted focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-text-muted hover:text-text"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {(["ALL", "ACTIVE", "PAUSED", "REMOVED", "PENDING"] as StatusFilter[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setFilter(tab)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                filter === tab
                  ? "bg-navy-900 text-white"
                  : "bg-surface-sunken text-text-secondary hover:bg-surface-sunken/80"
              }`}
            >
              {tab === "ALL"
                ? "All Items"
                : tab === "ACTIVE"
                  ? "Live"
                  : tab === "PAUSED"
                    ? "Paused"
                    : tab === "REMOVED"
                      ? "Taken Down"
                      : "Pending"}
            </button>
          ))}
        </div>
      </div>

      {/* Main Items Table / Cards Grid */}
      {query.isLoading && query.items.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-text-secondary">
          <RefreshCw className="size-5 animate-spin text-brand-600" />
          Loading rental inventory…
        </div>
      ) : filteredItems.length === 0 ? (
        <EmptyState
          title="No rental items match criteria"
          description="Try selecting another status tab or clearing your search query."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-text">
              <thead className="border-b border-line bg-surface-sunken/70 text-xs font-semibold uppercase tracking-wider text-text-secondary">
                <tr>
                  <th className="px-4 py-3.5">Rental Item</th>
                  <th className="px-4 py-3.5">Pricing</th>
                  <th className="px-4 py-3.5">Stock & Delivery</th>
                  <th className="px-4 py-3.5">Pickup Location</th>
                  <th className="px-4 py-3.5">Poster (Partner)</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5 text-right">Admin Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filteredItems.map((item) => {
                  const media = (item as { media?: { url?: string }[] }).media;
                  const photoUrl = media?.[0]?.url;
                  const isRemoved =
                    item.moderation_status === "REMOVED" || item.public_state === "REMOVED";
                  const isPending =
                    item.moderation_status === "PENDING" || item.public_state === "PENDING_REVIEW";
                  const isLive =
                    (item.moderation_status === "APPROVED" || item.current_status === "ACTIVE") &&
                    !isRemoved;

                  return (
                    <tr key={item.id} className="hover:bg-surface-sunken/40">
                      {/* Title & Media */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-surface-sunken">
                            {photoUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={photoUrl} alt="" className="size-full object-cover" />
                            ) : (
                              <div className="flex size-full items-center justify-center text-[10px] text-text-muted">
                                No photo
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col">
                            <span className="font-semibold text-navy-900 line-clamp-1">
                              {item.title}
                            </span>
                            <span className="text-xs text-text-secondary">
                              {item.condition_grade
                                ? `Condition: ${item.condition_grade}`
                                : "Rental Equipment"}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Pricing */}
                      <td className="px-4 py-3.5">
                        <div className="flex flex-col text-xs">
                          <span className="font-bold text-navy-900">
                            {formatMoney(item.daily_rate_paise)} / day
                          </span>
                          <span className="text-text-secondary">
                            Deposit: {formatMoney(item.deposit_paise)}
                          </span>
                        </div>
                      </td>

                      {/* Stock & Delivery */}
                      <td className="px-4 py-3.5">
                        <div className="flex flex-col gap-1 text-xs">
                          <span className="font-medium text-navy-900">
                            {item.quantity_available ?? 1} units available
                          </span>
                          {item.delivery_available ? (
                            <span className="inline-flex items-center gap-1 text-brand-600">
                              <Truck className="size-3" /> Delivery offered
                            </span>
                          ) : (
                            <span className="text-text-muted">Self pickup only</span>
                          )}
                        </div>
                      </td>

                      {/* Location */}
                      <td className="px-4 py-3.5">
                        <div className="flex flex-col gap-0.5 text-xs">
                          <span className="font-medium text-navy-900">
                            {item.pickup_city || item.location_text || "Unspecified"}
                          </span>
                          {item.pickup_area && (
                            <span className="text-text-secondary line-clamp-1">
                              {item.pickup_area}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Poster */}
                      <td className="px-4 py-3.5">
                        <div className="flex flex-col items-start gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedPartner({
                                id: (item as unknown as { partner_id?: string }).partner_id || null,
                                name: item.partner_name,
                                phone: (item as unknown as { partner_phone?: string }).partner_phone,
                              })
                            }
                            className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline hover:text-brand-700"
                          >
                            <User className="size-3" />
                            {item.partner_name || "Poster"}
                          </button>
                          {(item as unknown as { partner_phone?: string }).partner_phone && (
                            <span className="text-[11px] text-text-muted">
                              {(item as unknown as { partner_phone?: string }).partner_phone}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5">{statusBadge(item)}</td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setInspectItem(item)}
                            title="Inspect complete rental details"
                            className="rounded-lg border border-line bg-surface p-1.5 text-text-secondary hover:bg-surface-sunken hover:text-navy-900"
                          >
                            <Eye className="size-4" />
                          </button>

                          {isLive && (
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => openDecision(item, "REMOVE")}
                              title="Turn off this rental item from marketplace"
                            >
                              <PowerOff className="mr-1 size-3.5" />
                              Turn Off
                            </Button>
                          )}

                          {isRemoved && (
                            <Button
                              size="sm"
                              variant="primary"
                              onClick={() => openDecision(item, "REINSTATE")}
                              title="Reinstate this item to the live marketplace"
                            >
                              <CheckCircle2 className="mr-1 size-3.5" />
                              Reinstate
                            </Button>
                          )}

                          {isPending && (
                            <>
                              <Button
                                size="sm"
                                variant="primary"
                                onClick={() => openDecision(item, "APPROVE")}
                              >
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openDecision(item, "REJECT")}
                              >
                                Reject
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <LoadMore hasMore={query.hasMore} loading={query.loadingMore} onLoadMore={query.loadMore} />

      {/* Moderation Confirmation Modal */}
      {decision && copy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/50 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            className="flex w-full max-w-lg flex-col overflow-hidden rounded-card border border-line bg-surface shadow-overlay animate-in fade-in duration-150"
          >
            <div className="px-5 pb-3 pt-5">
              <h2 className="text-base font-bold text-navy-900">{copy.title}</h2>
              <p className="mt-1 text-sm text-text-secondary">
                {decision.item.title} · {copy.description}
              </p>
            </div>
            <div className="px-5 py-2">
              <Field
                label="Reason for decision"
                required
                showOptional={false}
                description="Recorded in the permanent audit trail. Customer and partner do not see this internal note."
              >
                <Textarea
                  rows={3}
                  value={decisionReason}
                  onChange={(event) => setDecisionReason(event.target.value)}
                  placeholder="e.g. Policy violation, safety concerns, unverified listing, or partner request..."
                />
              </Field>
              {moderateMutation.isError && (
                <p className="mt-2 text-xs text-danger-text">
                  {moderateMutation.error instanceof Error
                    ? moderateMutation.error.message
                    : "The moderation decision could not be saved."}
                </p>
              )}
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setDecision(null);
                  setDecisionReason("");
                  moderateMutation.reset();
                }}
              >
                Cancel
              </Button>
              <Button
                variant={copy.danger ? "danger" : "primary"}
                size="sm"
                disabled={!decisionReason.trim() || moderateMutation.isPending}
                loading={moderateMutation.isPending}
                onClick={() => {
                  if (!decisionReason.trim()) return;
                  moderateMutation.mutate({
                    id: decision.item.id,
                    action: decision.action,
                    reason: decisionReason.trim(),
                  });
                }}
              >
                {copy.confirm}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Item Detail Inspection Modal */}
      {inspectItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/60 p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-surface shadow-2xl overflow-hidden border border-line">
            <div className="flex items-center justify-between border-b border-line px-6 py-4">
              <div className="flex items-center gap-2">
                <Package className="size-5 text-brand-600" />
                <h3 className="font-bold text-navy-900">Rental Asset Details</h3>
              </div>
              <button
                type="button"
                onClick={() => setInspectItem(null)}
                className="rounded-lg p-1 text-text-muted hover:bg-surface-sunken"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5 text-sm">
              <div>
                <h4 className="text-xl font-bold text-navy-900">{inspectItem.title}</h4>
                <div className="mt-1 flex items-center gap-2">
                  {statusBadge(inspectItem)}
                  <span className="text-xs text-text-secondary">
                    {inspectItem.created_at ? `Created ${formatDate(inspectItem.created_at)}` : "Rental item"}
                  </span>
                </div>
              </div>

              {/* Photos Gallery */}
              {inspectItem.media && inspectItem.media.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase text-text-secondary">
                    Listing Photos ({inspectItem.media.length})
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    {inspectItem.media.map((m, idx) => (
                      <div
                        key={m.id || idx}
                        className="relative aspect-[4/3] overflow-hidden rounded-lg bg-surface-sunken"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={m.url || m.image_url}
                          alt=""
                          className="size-full object-cover"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Pricing & Stock Card */}
              <div className="grid grid-cols-2 gap-3 rounded-xl bg-surface-sunken/60 p-4 text-xs">
                <div>
                  <span className="text-text-muted">Daily Rental Rate:</span>
                  <p className="font-bold text-navy-900 text-sm">
                    {formatMoney(inspectItem.daily_rate_paise)} / day
                  </p>
                </div>
                <div>
                  <span className="text-text-muted">Security Deposit:</span>
                  <p className="font-bold text-navy-900 text-sm">
                    {formatMoney(inspectItem.deposit_paise)}
                  </p>
                </div>
                <div>
                  <span className="text-text-muted">Quantity Available:</span>
                  <p className="font-semibold text-navy-900">
                    {inspectItem.quantity_available ?? 1} units
                  </p>
                </div>
                <div>
                  <span className="text-text-muted">Delivery:</span>
                  <p className="font-semibold text-navy-900">
                    {inspectItem.delivery_available ? "Delivery Offered" : "Self Pickup Only"}
                  </p>
                </div>
              </div>

              {/* Pickup Address */}
              <div className="rounded-xl border border-line p-4 space-y-1 text-xs">
                <span className="font-semibold uppercase tracking-wider text-text-secondary">
                  Pickup Address
                </span>
                <p className="font-medium text-navy-900">
                  {[
                    inspectItem.pickup_address_line,
                    inspectItem.pickup_area,
                    inspectItem.pickup_city,
                    inspectItem.pickup_pincode,
                  ]
                    .filter(Boolean)
                    .join(", ") || inspectItem.location_text || "No address provided"}
                </p>
                {inspectItem.pickup_address?.maps_url && (
                  <a
                    href={inspectItem.pickup_address.maps_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-brand-600 hover:underline pt-1"
                  >
                    <ExternalLink className="size-3" /> View Map Location
                  </a>
                )}
              </div>

              {/* Description */}
              {inspectItem.description && (
                <div>
                  <span className="text-xs font-semibold uppercase text-text-secondary">
                    Description
                  </span>
                  <p className="mt-1 whitespace-pre-wrap rounded-xl border border-line bg-surface p-3 text-xs text-text-secondary leading-relaxed">
                    {inspectItem.description}
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-line bg-surface-sunken/40 px-6 py-3">
              <button
                type="button"
                onClick={() => {
                  const partner = {
                    id: (inspectItem as unknown as { partner_id?: string }).partner_id || null,
                    name: inspectItem.partner_name,
                    phone: (inspectItem as unknown as { partner_phone?: string }).partner_phone,
                  };
                  setInspectItem(null);
                  setSelectedPartner(partner);
                }}
                className="text-xs font-semibold text-brand-600 hover:underline"
              >
                Inspect Poster Profile →
              </button>
              <Button variant="outline" size="sm" onClick={() => setInspectItem(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Partner Profile Drawer */}
      <PartnerProfileDrawer
        partnerId={selectedPartner?.id ?? null}
        partnerName={selectedPartner?.name}
        partnerPhone={selectedPartner?.phone}
        open={selectedPartner !== null}
        onClose={() => setSelectedPartner(null)}
      />
    </div>
  );
}
