"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePagedList } from "@vsolve/query";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  LoadMore,
  Textarea,
  formatDate,
  formatMoney,
} from "@vsolve/ui";
import {
  CheckCircle2,
  Eye,
  Home,
  MapPin,
  PowerOff,
  RefreshCw,
  Search,
  User,
  X,
} from "lucide-react";

import {
  cancelOpsStayReservation,
  fetchOpsStayEnquiries,
  fetchOpsStayReservations,
  fetchOpsStaysPage,
  moderateOpsStay,
  type ModerationAction,
  type OpsStayProperty,
} from "./queries";
import { PartnerProfileDrawer } from "./partner-profile-drawer";
import { useDebounced } from "@/features/shared/use-debounced";
import { MoneyTab, useListingCounts } from "@/features/money/money-tab";
import { ServiceTabs, useServiceTab } from "@/features/money/service-tabs";
import { StayPlans } from "./stay-plans";

const TABS = [
  { key: "properties", label: "Properties" },
  { key: "enquiries", label: "Enquiries" },
  { key: "reservations", label: "Reservations" },
  { key: "money", label: "Money" },
  { key: "plans", label: "Plans" },
] as const;
type StatusFilter = "ALL" | "ACTIVE" | "REMOVED" | "PENDING";

const ACTION_COPY: Record<
  ModerationAction,
  { title: string; description: string; confirm: string; danger: boolean }
> = {
  APPROVE: {
    title: "Approve this stay property",
    description: "It becomes visible to customers in the stays marketplace.",
    confirm: "Approve",
    danger: false,
  },
  REJECT: {
    title: "Reject this stay property",
    description: "It stays off the marketplace. The host can make amendments.",
    confirm: "Reject",
    danger: true,
  },
  REMOVE: {
    title: "Turn off / Take down property",
    description: "Guests will immediately stop seeing this property in search and stays.",
    confirm: "Turn Off Property",
    danger: true,
  },
  REINSTATE: {
    title: "Reinstate stay property",
    description: "This property will be turned back on and visible to guests.",
    confirm: "Reinstate Property",
    danger: false,
  },
};

function propertyStatusBadge(item: OpsStayProperty) {
  if (item.moderation_status === "APPROVED" || item.public_state === "PUBLISHED") {
    return <Badge tone="success">Live</Badge>;
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

export function StaysOperationsWorkspace() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useServiceTab(TABS);
  // True totals from the server: the list below holds only the pages loaded so far.
  const serverCounts = useListingCounts("stays");
  const [filter, setFilter] = useState<StatusFilter>("ALL");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search.trim().toLowerCase());

  // Inspections and Modals
  const [inspectProperty, setInspectProperty] = useState<OpsStayProperty | null>(null);
  const [selectedHost, setSelectedHost] = useState<{
    id: string | null;
    name?: string;
    phone?: string;
  } | null>(null);
  const [decision, setDecision] = useState<{
    item: OpsStayProperty;
    action: ModerationAction;
  } | null>(null);
  const [decisionReason, setDecisionReason] = useState("");

  // Reservation cancellation modal
  const [cancellingReservation, setCancellingReservation] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  // Queries
  const staysPage = usePagedList(["ops-stays", filter === "PENDING" ? "PENDING" : undefined], (cursor) =>
    fetchOpsStaysPage(cursor, filter === "PENDING" ? "PENDING" : undefined),
  );

  const enquiries = useQuery({
    queryKey: ["ops-stays-enquiries"],
    queryFn: fetchOpsStayEnquiries,
  });

  const reservations = useQuery({
    queryKey: ["ops-stays-reservations"],
    queryFn: fetchOpsStayReservations,
  });

  // Moderation Mutation
  const moderateMutation = useMutation({
    mutationFn: ({
      id,
      action,
      reason,
    }: {
      id: string;
      action: ModerationAction;
      reason: string;
    }) => moderateOpsStay(id, action, reason),
    onSuccess: () => {
      setDecision(null);
      setDecisionReason("");
      void qc.invalidateQueries({ queryKey: ["ops-stays"] });
    },
  });

  // Reservation cancel mutation
  const cancelReservationMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      cancelOpsStayReservation(id, reason),
    onSuccess: () => {
      setCancellingReservation(null);
      setCancelReason("");
      void qc.invalidateQueries({ queryKey: ["ops-stays-reservations"] });
    },
  });

  // Filtering properties
  const filteredProperties = useMemo(() => {
    return staysPage.items.filter((item) => {
      const isPending =
        item.moderation_status === "PENDING" || item.public_state === "PENDING_REVIEW";
      const isRemoved =
        item.moderation_status === "REMOVED" || item.public_state === "REMOVED";
      const isLive =
        (item.moderation_status === "APPROVED" || item.public_state === "PUBLISHED") && !isRemoved;

      if (filter === "ACTIVE" && !isLive) return false;
      if (filter === "REMOVED" && !isRemoved) return false;
      if (filter === "PENDING" && !isPending) return false;

      if (debouncedSearch) {
        const titleMatch = item.title?.toLowerCase().includes(debouncedSearch);
        const hostMatch = item.host_name?.toLowerCase().includes(debouncedSearch);
        const locMatch = item.location_text?.toLowerCase().includes(debouncedSearch);
        if (!titleMatch && !hostMatch && !locMatch) return false;
      }

      return true;
    });
  }, [staysPage.items, filter, debouncedSearch]);

  // Counts
  const counts = useMemo(() => {
    let live = 0;
    let removed = 0;
    let pending = 0;
    for (const item of staysPage.items) {
      if (item.moderation_status === "REMOVED" || item.public_state === "REMOVED") removed++;
      else if (item.moderation_status === "PENDING" || item.public_state === "PENDING_REVIEW") pending++;
      else live++;
    }
    return {
      total: serverCounts?.total ?? staysPage.items.length,
      live: serverCounts?.live ?? live,
      removed: serverCounts?.removed ?? removed,
      pending: serverCounts?.pending ?? pending,
      enquiries: enquiries.data?.length ?? 0,
      reservations: reservations.data?.length ?? 0,
    };
  }, [staysPage.items, enquiries.data, reservations.data, serverCounts]);

  const openDecision = (item: OpsStayProperty, action: ModerationAction) => {
    setDecisionReason("");
    moderateMutation.reset();
    setDecision({ item, action });
  };

  const copy = decision ? ACTION_COPY[decision.action] : null;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Home className="size-6 text-brand-600" />
            <h1 className="text-2xl font-bold text-navy-900">Stays & Hospitality Management</h1>
          </div>
          <p className="mt-1 text-sm text-text-secondary">
            Manage stay properties, turn listings off or reinstate them, inspect hosts, and oversee guest enquiries & bookings.
          </p>
        </div>
      </div>

      <ServiceTabs tabs={TABS} active={activeTab} onChange={setActiveTab} label="Stays sections" />

      {activeTab === "money" ? <MoneyTab service="stays" /> : null}
      {activeTab === "plans" ? <StayPlans /> : null}

      {/* Count cards belong to the property list, so they show on that tab only. */}
      {activeTab === "properties" ? (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <button
          type="button"
          onClick={() => {
            setActiveTab("properties");
            setFilter("ALL");
          }}
          className={`flex flex-col rounded-xl border p-3 text-left transition ${
            activeTab === "properties" && filter === "ALL"
              ? "border-brand-500 bg-brand-50/50 shadow-sm"
              : "border-line bg-surface hover:bg-surface-sunken"
          }`}
        >
          <span className="text-xs font-medium text-text-secondary">Properties</span>
          <span className="mt-1 text-xl font-bold text-navy-900">{counts.total}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab("properties");
            setFilter("ACTIVE");
          }}
          className={`flex flex-col rounded-xl border p-3 text-left transition ${
            activeTab === "properties" && filter === "ACTIVE"
              ? "border-success-500 bg-success-50/50 shadow-sm"
              : "border-line bg-surface hover:bg-surface-sunken"
          }`}
        >
          <span className="text-xs font-medium text-success-700">Live Properties</span>
          <span className="mt-1 text-xl font-bold text-navy-900">{counts.live}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab("properties");
            setFilter("REMOVED");
          }}
          className={`flex flex-col rounded-xl border p-3 text-left transition ${
            activeTab === "properties" && filter === "REMOVED"
              ? "border-danger-500 bg-danger-50/50 shadow-sm"
              : "border-line bg-surface hover:bg-surface-sunken"
          }`}
        >
          <span className="text-xs font-medium text-danger-700">Turned Off</span>
          <span className="mt-1 text-xl font-bold text-navy-900">{counts.removed}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab("properties");
            setFilter("PENDING");
          }}
          className={`flex flex-col rounded-xl border p-3 text-left transition ${
            activeTab === "properties" && filter === "PENDING"
              ? "border-brand-500 bg-brand-50/50 shadow-sm"
              : "border-line bg-surface hover:bg-surface-sunken"
          }`}
        >
          <span className="text-xs font-medium text-text-secondary">Pending Approval</span>
          <span className="mt-1 text-xl font-bold text-navy-900">{counts.pending}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("reservations")}
          className="flex flex-col rounded-xl border border-line bg-surface p-3 text-left transition hover:bg-surface-sunken"
        >
          <span className="text-xs font-medium text-text-secondary">Bookings / Stays</span>
          <span className="mt-1 text-xl font-bold text-navy-900">{counts.reservations}</span>
        </button>
      </div>
      ) : null}

      {/* PROPERTIES TAB */}
      {activeTab === "properties" && (
        <>
          {/* Search & Filters */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by property title, host name, city..."
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
              {(["ALL", "ACTIVE", "REMOVED", "PENDING"] as StatusFilter[]).map((tab) => (
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
                    ? "All Properties"
                    : tab === "ACTIVE"
                      ? "Live"
                      : tab === "REMOVED"
                        ? "Taken Down"
                        : "Pending"}
                </button>
              ))}
            </div>
          </div>

          {/* Properties Table */}
          {staysPage.isLoading && staysPage.items.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-text-secondary">
              <RefreshCw className="size-5 animate-spin text-brand-600" />
              Loading stay properties…
            </div>
          ) : filteredProperties.length === 0 ? (
            <EmptyState
              title="No stay properties found"
              description="No properties match your filter criteria or search query."
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-text">
                  <thead className="border-b border-line bg-surface-sunken/70 text-xs font-semibold uppercase tracking-wider text-text-secondary">
                    <tr>
                      <th className="px-4 py-3.5">Property</th>
                      <th className="px-4 py-3.5">Units & Pricing</th>
                      <th className="px-4 py-3.5">Location</th>
                      <th className="px-4 py-3.5">Host (Partner)</th>
                      <th className="px-4 py-3.5">Status</th>
                      <th className="px-4 py-3.5 text-right">Admin Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {filteredProperties.map((prop) => {
                      const media = (prop as { media?: { url?: string }[] }).media;
                      const photoUrl = media?.[0]?.url;
                      const isRemoved =
                        prop.moderation_status === "REMOVED" || prop.public_state === "REMOVED";
                      const isPending =
                        prop.moderation_status === "PENDING" || prop.public_state === "PENDING_REVIEW";
                      const isLive =
                        (prop.moderation_status === "APPROVED" || prop.public_state === "PUBLISHED") &&
                        !isRemoved;

                      const firstUnit = prop.units?.[0];
                      const rate = firstUnit?.nightly_rate_paise;
                      const unitCount = prop.units?.length ?? 0;

                      return (
                        <tr key={prop.id} className="hover:bg-surface-sunken/40">
                          {/* Property Info */}
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
                                  {prop.title}
                                </span>
                                <span className="text-xs text-text-secondary">
                                  {prop.room_style ? `${prop.room_style} style` : "Hospitality stay"}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Units & Pricing */}
                          <td className="px-4 py-3.5">
                            <div className="flex flex-col text-xs">
                              <span className="font-bold text-navy-900">
                                {typeof rate === "number" ? `${formatMoney(rate)} / night` : "Rates vary"}
                              </span>
                              <span className="text-text-secondary">
                                {unitCount > 0 ? `${unitCount} room type(s)` : "Standard stay"}
                              </span>
                            </div>
                          </td>

                          {/* Location */}
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-1 text-xs text-navy-900">
                              <MapPin className="size-3.5 text-text-muted shrink-0" />
                              <span className="line-clamp-1">
                                {prop.location_text || "Unspecified"}
                              </span>
                            </div>
                          </td>

                          {/* Host */}
                          <td className="px-4 py-3.5">
                            <div className="flex flex-col items-start gap-1">
                              <button
                                type="button"
                                onClick={() =>
                                  setSelectedHost({
                                    id:
                                      (prop as unknown as { host_id?: string; partner_id?: string })
                                        .host_id ||
                                      (prop as unknown as { partner_id?: string }).partner_id ||
                                      null,
                                    name: prop.host_name,
                                    phone: (prop as unknown as { host_phone?: string }).host_phone,
                                  })
                                }
                                className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline hover:text-brand-700"
                              >
                                <User className="size-3" />
                                {prop.host_name || "Host"}
                              </button>
                              {(prop as unknown as { host_phone?: string }).host_phone && (
                                <span className="text-[11px] text-text-muted">
                                  {(prop as unknown as { host_phone?: string }).host_phone}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Status */}
                          <td className="px-4 py-3.5">{propertyStatusBadge(prop)}</td>

                          {/* Actions */}
                          <td className="px-4 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setInspectProperty(prop)}
                                title="Inspect complete stay details"
                                className="rounded-lg border border-line bg-surface p-1.5 text-text-secondary hover:bg-surface-sunken hover:text-navy-900"
                              >
                                <Eye className="size-4" />
                              </button>

                              {isLive && (
                                <Button
                                  size="sm"
                                  variant="danger"
                                  onClick={() => openDecision(prop, "REMOVE")}
                                  title="Turn off this stay property"
                                >
                                  <PowerOff className="mr-1 size-3.5" />
                                  Turn Off
                                </Button>
                              )}

                              {isRemoved && (
                                <Button
                                  size="sm"
                                  variant="primary"
                                  onClick={() => openDecision(prop, "REINSTATE")}
                                  title="Reinstate this stay property"
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
                                    onClick={() => openDecision(prop, "APPROVE")}
                                  >
                                    Approve
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => openDecision(prop, "REJECT")}
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

          <LoadMore
            hasMore={staysPage.hasMore}
            loading={staysPage.loadingMore}
            onLoadMore={staysPage.loadMore}
          />
        </>
      )}

      {/* ENQUIRIES TAB */}
      {activeTab === "enquiries" && (
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-bold text-navy-900">Guest Enquiries & Messages</h2>
            <span className="text-xs text-text-secondary">
              {enquiries.data?.length ?? 0} active enquiries
            </span>
          </div>

          {enquiries.isLoading ? <p className="text-sm text-text-secondary">Loading enquiries…</p> : null}
          {enquiries.error ? (
            <p className="text-sm text-danger-text">{(enquiries.error as Error).message}</p>
          ) : null}
          {enquiries.data && enquiries.data.length === 0 ? (
            <EmptyState compact title="No enquiries" description="Guest questions show up here." />
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            {enquiries.data?.map((enquiry) => (
              <div key={enquiry.id} className="rounded-xl border border-line p-4 space-y-2 bg-surface">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-navy-900">{enquiry.property_title}</p>
                  <Badge tone={enquiry.status === "CONFIRMED" ? "success" : "neutral"}>
                    {enquiry.status}
                  </Badge>
                </div>
                <p className="text-xs text-text-secondary">
                  {formatDate(`${enquiry.check_in}T12:00:00`)} – {formatDate(`${enquiry.check_out}T12:00:00`)}
                  {typeof enquiry.total_quote_paise === "number"
                    ? ` · ${formatMoney(enquiry.total_quote_paise)}`
                    : ""}
                </p>
                <p className="text-xs text-text-muted">Guests: {enquiry.guest_count || 1}</p>
                {enquiry.message && (
                  <p className="rounded-lg bg-surface-sunken p-2.5 text-xs text-text-secondary italic">
                    &ldquo;{enquiry.message}&rdquo;
                  </p>
                )}
                {enquiry.host_response && (
                  <p className="text-xs text-brand-700">
                    <span className="font-semibold">Host reply:</span> {enquiry.host_response}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* RESERVATIONS TAB */}
      {activeTab === "reservations" && (
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-bold text-navy-900">Confirmed Reservations & Bookings</h2>
            <span className="text-xs text-text-secondary">
              {reservations.data?.length ?? 0} reservations
            </span>
          </div>

          {reservations.isLoading ? (
            <p className="text-sm text-text-secondary">Loading reservations…</p>
          ) : null}
          {reservations.error ? (
            <p className="text-sm text-danger-text">{(reservations.error as Error).message}</p>
          ) : null}
          {reservations.data && reservations.data.length === 0 ? (
            <EmptyState
              compact
              title="No reservations"
              description="Hotel / short-stay bookings show up here."
            />
          ) : null}

          <div className="divide-y divide-line rounded-xl border border-line bg-surface">
            {reservations.data?.map((reservation) => (
              <div key={reservation.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="space-y-1">
                  <p className="font-semibold text-navy-900">
                    {reservation.property_title ?? "Stay Property"} · {reservation.unit_name ?? "Room"}
                  </p>
                  <p className="text-xs text-text-secondary">
                    {formatDate(`${reservation.check_in}T12:00:00`)} –{" "}
                    {formatDate(`${reservation.check_out}T12:00:00`)}
                    {typeof reservation.total_paise === "number"
                      ? ` · ${formatMoney(reservation.total_paise)}`
                      : ""}
                  </p>
                  <p className="text-xs text-text-muted">
                    Guest: <span className="font-semibold text-text">{reservation.customer_name || "Guest"}</span>
                    {reservation.customer_phone ? ` (${reservation.customer_phone})` : ""}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Badge
                    tone={
                      reservation.status === "CONFIRMED"
                        ? "success"
                        : reservation.status === "CANCELLED"
                          ? "danger"
                          : "neutral"
                    }
                  >
                    {reservation.status}
                  </Badge>

                  {reservation.status !== "CANCELLED" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setCancellingReservation(reservation.id)}
                    >
                      Cancel Reservation
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

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
                description="Recorded in the permanent audit trail. Guest and host do not see this internal note."
              >
                <Textarea
                  rows={3}
                  value={decisionReason}
                  onChange={(event) => setDecisionReason(event.target.value)}
                  placeholder="e.g. Safety policy, unverified listing, fraudulent photos, or host request..."
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

      {/* Property Detail Inspection Modal */}
      {inspectProperty && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/60 p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-surface shadow-2xl overflow-hidden border border-line">
            <div className="flex items-center justify-between border-b border-line px-6 py-4">
              <div className="flex items-center gap-2">
                <Home className="size-5 text-brand-600" />
                <h3 className="font-bold text-navy-900">Stay Property Details</h3>
              </div>
              <button
                type="button"
                onClick={() => setInspectProperty(null)}
                className="rounded-lg p-1 text-text-muted hover:bg-surface-sunken"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5 text-sm">
              <div>
                <h4 className="text-xl font-bold text-navy-900">{inspectProperty.title}</h4>
                <div className="mt-1 flex items-center gap-2">
                  {propertyStatusBadge(inspectProperty)}
                  <span className="text-xs text-text-secondary">
                    Location: {inspectProperty.location_text || "Unspecified"}
                  </span>
                </div>
              </div>

              {/* Photos Gallery */}
              {inspectProperty.media && inspectProperty.media.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase text-text-secondary">
                    Property Photos ({inspectProperty.media.length})
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    {inspectProperty.media.map((m, idx) => (
                      <div
                        key={m.id || idx}
                        className="relative aspect-[4/3] overflow-hidden rounded-lg bg-surface-sunken"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={m.url} alt="" className="size-full object-cover" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Units / Rooms */}
              {inspectProperty.units && inspectProperty.units.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-semibold uppercase text-text-secondary">
                    Room Types & Configurations ({inspectProperty.units.length})
                  </span>
                  <div className="divide-y divide-line rounded-xl border border-line bg-surface">
                    {inspectProperty.units.map((unit) => (
                      <div key={unit.id} className="flex items-center justify-between p-3 text-xs">
                        <div>
                          <p className="font-semibold text-navy-900">{unit.name}</p>
                          <p className="text-text-muted">
                            {unit.available_count ?? 1} room(s) · Up to {unit.max_guests} guests
                          </p>
                        </div>
                        <span className="font-bold text-navy-900">
                          {formatMoney(unit.nightly_rate_paise)} / night
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Amenities */}
              {inspectProperty.amenities && inspectProperty.amenities.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-semibold uppercase text-text-secondary">
                    Amenities
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {inspectProperty.amenities.map((amenity) => (
                      <span
                        key={amenity.key}
                        className="rounded-full bg-surface-sunken px-2.5 py-1 text-xs font-medium text-text-secondary ring-1 ring-line"
                      >
                        {amenity.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* House Rules & Policies */}
              {inspectProperty.house_rules && (
                <div className="rounded-xl border border-line p-4 space-y-1 text-xs bg-surface-sunken/40">
                  <span className="font-semibold uppercase tracking-wider text-text-secondary">
                    House Rules
                  </span>
                  <p className="text-text leading-relaxed whitespace-pre-wrap">
                    {inspectProperty.house_rules}
                  </p>
                </div>
              )}

              {inspectProperty.cancellation_policy_text && (
                <div className="rounded-xl border border-line p-4 space-y-1 text-xs bg-surface-sunken/40">
                  <span className="font-semibold uppercase tracking-wider text-text-secondary">
                    Cancellation Policy
                  </span>
                  <p className="text-text leading-relaxed">
                    {inspectProperty.cancellation_policy_text}
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-line bg-surface-sunken/40 px-6 py-3">
              <button
                type="button"
                onClick={() => {
                  const host = {
                    id:
                      (inspectProperty as unknown as { host_id?: string; partner_id?: string })
                        .host_id ||
                      (inspectProperty as unknown as { partner_id?: string }).partner_id ||
                      null,
                    name: inspectProperty.host_name,
                    phone: (inspectProperty as unknown as { host_phone?: string }).host_phone,
                  };
                  setInspectProperty(null);
                  setSelectedHost(host);
                }}
                className="text-xs font-semibold text-brand-600 hover:underline"
              >
                Inspect Host Profile →
              </button>
              <Button variant="outline" size="sm" onClick={() => setInspectProperty(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Reservation Modal */}
      {cancellingReservation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/50 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            className="flex w-full max-w-md flex-col overflow-hidden rounded-card border border-line bg-surface shadow-overlay"
          >
            <div className="px-5 pb-3 pt-5">
              <h2 className="text-base font-bold text-navy-900">Cancel Guest Reservation</h2>
              <p className="mt-1 text-xs text-text-secondary">
                Cancelling triggers an automatic refund and releases the booked room dates.
              </p>
            </div>
            <div className="px-5 py-2">
              <Field label="Cancellation reason" required showOptional={false}>
                <Textarea
                  rows={2}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="e.g. Host emergency, double-booking, guest requested cancel via ops..."
                />
              </Field>
            </div>
            <div className="flex justify-end gap-2 border-t border-line px-5 py-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setCancellingReservation(null);
                  setCancelReason("");
                }}
              >
                Keep Reservation
              </Button>
              <Button
                variant="danger"
                size="sm"
                disabled={!cancelReason.trim() || cancelReservationMutation.isPending}
                loading={cancelReservationMutation.isPending}
                onClick={() => {
                  if (!cancelReason.trim()) return;
                  cancelReservationMutation.mutate({
                    id: cancellingReservation,
                    reason: cancelReason.trim(),
                  });
                }}
              >
                Confirm Cancellation
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Host Profile Drawer */}
      <PartnerProfileDrawer
        partnerId={selectedHost?.id ?? null}
        partnerName={selectedHost?.name}
        partnerPhone={selectedHost?.phone}
        open={selectedHost !== null}
        onClose={() => setSelectedHost(null)}
      />
    </div>
  );
}
