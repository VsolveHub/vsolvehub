"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, RefreshCw, ShieldAlert } from "lucide-react";

import {
  fetchOpsListings,
  moderateOpsListing,
  reinstateOpsListing,
  removeOpsListing,
  type AdminListing,
} from "@/features/listings/queries";
import {
  ActionDialog,
  FilterSearchBar,
  ListingDetailDialog,
  ListingsTable,
  MetricsRow,
  ModerationDialog,
} from "@/features/listings/view";

export default function AdminListingsPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const [selectedListing, setSelectedListing] = useState<AdminListing | null>(null);
  const [modalAction, setModalAction] = useState<"VIEW" | "MODERATE" | "REMOVE" | "REINSTATE" | null>(null);
  const [actionReason, setActionReason] = useState("");
  const [isApproving, setIsApproving] = useState(true);

  const {
    data: listings = [],
    isLoading: loading,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["ops-listings"],
    queryFn: fetchOpsListings,
  });

  const invalidate = () => {
    closeModal();
    void queryClient.invalidateQueries({ queryKey: ["ops-listings"] });
  };

  const moderateMutation = useMutation({
    mutationFn: ({ id, approved, reason }: { id: string; approved: boolean; reason: string }) =>
      moderateOpsListing(id, approved, reason),
    onSuccess: invalidate,
    onError: (err: unknown) => alert(err instanceof Error ? err.message : "Moderation failed."),
  });

  const removeMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => removeOpsListing(id, reason),
    onSuccess: invalidate,
    onError: (err: unknown) => alert(err instanceof Error ? err.message : "Takedown failed."),
  });

  const reinstateMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => reinstateOpsListing(id, reason),
    onSuccess: invalidate,
    onError: (err: unknown) => alert(err instanceof Error ? err.message : "Reinstatement failed."),
  });

  function closeModal() {
    setSelectedListing(null);
    setModalAction(null);
    setActionReason("");
  }

  function handleModerateSubmit() {
    if (!selectedListing) return;
    moderateMutation.mutate({ id: selectedListing.id, approved: isApproving, reason: actionReason });
  }

  function handleActionSubmit() {
    if (!selectedListing || !modalAction) return;
    if (modalAction === "REMOVE") {
      if (!actionReason.trim()) return alert("A removal reason is required.");
      removeMutation.mutate({ id: selectedListing.id, reason: actionReason });
    } else {
      reinstateMutation.mutate({ id: selectedListing.id, reason: actionReason });
    }
  }

  const filteredListings = listings.filter((item) => {
    if (filter === "PENDING") {
      if (item.moderation_status !== "PENDING" && item.public_state !== "PENDING_REVIEW") return false;
    } else if (filter === "ACTIVE") {
      if (item.status !== "PUBLISHED") return false;
    } else if (filter === "REMOVED") {
      if (item.status !== "REMOVED" && item.moderation_status !== "REMOVED") return false;
    } else if (filter === "DRAFT") {
      if ((item.public_state || item.status) !== "DRAFT") return false;
    } else if (filter === "CLOSED") {
      if (!["CLOSED", "EXPIRED"].includes(item.status)) return false;
    }

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.title.toLowerCase().includes(q) ||
      (item.location_text || "").toLowerCase().includes(q) ||
      (item.contact_phone || "").toLowerCase().includes(q) ||
      (item.contact_email || "").toLowerCase().includes(q)
    );
  });

  const pendingCount = listings.filter(
    (l) => l.moderation_status === "PENDING" || l.public_state === "PENDING_REVIEW",
  ).length;
  const activeCount = listings.filter((l) => l.status === "PUBLISHED").length;
  const removedCount = listings.filter(
    (l) => l.status === "REMOVED" || l.moderation_status === "REMOVED",
  ).length;

  const submitting =
    moderateMutation.isPending || removeMutation.isPending || reinstateMutation.isPending;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Link href="/" className="hover:text-slate-800">
              Operations
            </Link>
            <span>/</span>
            <span className="font-semibold text-slate-700">Job & Career Listings</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            Job & Career Listings Oversight
          </h1>
          <p className="text-sm text-slate-600">
            Audit employer job postings, review moderation queues, and enforce safety standards.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/operations/cases"
            className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2 text-sm font-semibold text-amber-900 shadow-sm hover:bg-amber-100 transition-colors"
          >
            <ShieldAlert className="size-4 text-amber-700" />
            Safety Cases
          </Link>
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`size-4 ${isFetching ? "animate-spin text-orange-600" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <AlertTriangle className="size-5 shrink-0 text-amber-600" />
          <span>{error instanceof Error ? error.message : "Failed to load listings"}</span>
        </div>
      )}

      <MetricsRow
        totalCount={listings.length}
        pendingCount={pendingCount}
        activeCount={activeCount}
        removedCount={removedCount}
        onSelectFilter={setFilter}
      />

      <FilterSearchBar
        filter={filter}
        onFilterChange={setFilter}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        pendingCount={pendingCount}
        removedCount={removedCount}
      />

      <ListingsTable
        listings={filteredListings}
        loading={loading}
        onView={(l) => {
          setSelectedListing(l);
          setModalAction("VIEW");
        }}
        onModerate={(l) => {
          setSelectedListing(l);
          setIsApproving(true);
          setActionReason("");
          setModalAction("MODERATE");
        }}
        onRemove={(l) => {
          setSelectedListing(l);
          setActionReason("");
          setModalAction("REMOVE");
        }}
        onReinstate={(l) => {
          setSelectedListing(l);
          setActionReason("Verified compliant by operations");
          setModalAction("REINSTATE");
        }}
      />

      <ListingDetailDialog
        listing={modalAction === "VIEW" ? selectedListing : null}
        onClose={closeModal}
      />

      <ModerationDialog
        listing={modalAction === "MODERATE" ? selectedListing : null}
        onClose={closeModal}
        isApproving={isApproving}
        setIsApproving={setIsApproving}
        actionReason={actionReason}
        setActionReason={setActionReason}
        submitting={submitting}
        onSubmit={handleModerateSubmit}
      />

      <ActionDialog
        action={modalAction === "REMOVE" || modalAction === "REINSTATE" ? modalAction : null}
        listing={selectedListing}
        onClose={closeModal}
        reason={actionReason}
        onReasonChange={setActionReason}
        submitting={submitting}
        onSubmit={handleActionSubmit}
      />
    </div>
  );
}
