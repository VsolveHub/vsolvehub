"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { usePagedList } from "@vsolve/query";
import { LoadMore, useToast } from "@vsolve/ui";
import { AlertTriangle, RefreshCw, ShieldAlert } from "lucide-react";

import {
  fetchOpsListingsPage,
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
import { useDebounced } from "@/features/shared/use-debounced";

/** "50+" when the first page is full and the server has more. */
function pageCount(page: { results: unknown[]; next: string | null } | undefined): number | string {
  if (!page) return 0;
  return page.next ? `${page.results.length}+` : page.results.length;
}

export default function AdminListingsPage() {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [filter, setFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const [selectedListing, setSelectedListing] = useState<AdminListing | null>(null);
  const [modalAction, setModalAction] = useState<"VIEW" | "MODERATE" | "REMOVE" | "REINSTATE" | null>(null);
  const [actionReason, setActionReason] = useState("");
  const [isApproving, setIsApproving] = useState(true);

  const q = useDebounced(searchQuery.trim());
  const listingsPage = usePagedList(["ops-listings", filter, q], (cursor) =>
    fetchOpsListingsPage(cursor, filter, q),
  );
  const { items: listings, isLoading: loading, error, refetch } = listingsPage;
  const isFetching = loading || listingsPage.loadingMore;
  // Counts for the tiles: the first page of each queue, so a full page reads "50+".
  const [totalPage, pendingPage, activePage, removedPage] = useQueries({
    queries: ["ALL", "PENDING", "ACTIVE", "REMOVED"].map((name) => ({
      queryKey: ["ops-listings", name, "", "count"],
      queryFn: () => fetchOpsListingsPage(undefined, name, ""),
    })),
  }).map((query) => query.data);

  const onDone = (message: string) => () => {
    closeModal();
    notify(message);
    void queryClient.invalidateQueries({ queryKey: ["ops-listings"] });
  };
  // Shown inside the open dialog: a browser alert() blocked the page and lost the typed reason.
  const failure = (err: unknown, fallback: string) =>
    err instanceof Error && err.message ? err.message : fallback;

  const moderateMutation = useMutation({
    mutationFn: ({ id, approved, reason }: { id: string; approved: boolean; reason: string }) =>
      moderateOpsListing(id, approved, reason),
    onSuccess: onDone("Moderation decision saved."),
  });

  const removeMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => removeOpsListing(id, reason),
    onSuccess: onDone("Listing taken down."),
  });

  const reinstateMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => reinstateOpsListing(id, reason),
    onSuccess: onDone("Listing reinstated."),
  });

  function closeModal() {
    moderateMutation.reset();
    removeMutation.reset();
    reinstateMutation.reset();
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
      // The submit button stays disabled until a reason is typed.
      if (!actionReason.trim()) return;
      removeMutation.mutate({ id: selectedListing.id, reason: actionReason });
    } else {
      reinstateMutation.mutate({ id: selectedListing.id, reason: actionReason });
    }
  }

  const filteredListings = listings;
  const pendingCount = pageCount(pendingPage);
  const activeCount = pageCount(activePage);
  const removedCount = pageCount(removedPage);

  const submitting =
    moderateMutation.isPending || removeMutation.isPending || reinstateMutation.isPending;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-text-muted">
            <Link href="/" className="hover:text-text">
              Operations
            </Link>
            <span>/</span>
            <span className="font-semibold text-text-secondary">Job & Career Listings</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-text">
            Job & Career Listings Oversight
          </h1>
          <p className="text-sm text-text-secondary">
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
            className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-medium text-text-secondary shadow-sm hover:bg-surface-hover active:scale-95 disabled:opacity-50"
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
        totalCount={pageCount(totalPage)}
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
      <LoadMore
        hasMore={listingsPage.hasMore}
        loading={listingsPage.loadingMore}
        onLoadMore={listingsPage.loadMore}
        label="Load more listings"
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
        error={moderateMutation.isError ? failure(moderateMutation.error, "The decision was not saved. Try again.") : null}
      />

      <ActionDialog
        action={modalAction === "REMOVE" || modalAction === "REINSTATE" ? modalAction : null}
        listing={selectedListing}
        onClose={closeModal}
        reason={actionReason}
        onReasonChange={setActionReason}
        submitting={submitting}
        onSubmit={handleActionSubmit}
        error={
          removeMutation.isError
            ? failure(removeMutation.error, "The listing was not taken down. Try again.")
            : reinstateMutation.isError
              ? failure(reinstateMutation.error, "The listing was not reinstated. Try again.")
              : null
        }
      />
    </div>
  );
}
