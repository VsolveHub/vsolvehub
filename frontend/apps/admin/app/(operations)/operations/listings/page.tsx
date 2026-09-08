"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  BriefcaseBusiness,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  Search,
  X,
  Clock,
  MapPin,
  Phone,
  Mail,
  Eye,
  Crown,
} from "lucide-react";
import { apiFetch } from "@vsolve/api-client";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface AdminListing {
  id: string;
  title: string;
  description: string;
  status: string;
  moderation_status: string;
  moderation_reason?: string;
  location_text?: string;
  contact_phone?: string;
  contact_email?: string;
  structured_fields?: Record<string, string>;
  is_premium?: boolean;
  application_count: number;
  published_at?: string | null;
  expires_at?: string | null;
  closed_at?: string | null;
  removed_at?: string | null;
  created_at: string;
}

export default function AdminListingsPage() {
  const [listings, setListings] = useState<AdminListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Action Modals
  const [selectedListing, setSelectedListing] = useState<AdminListing | null>(null);
  const [modalAction, setModalAction] = useState<"VIEW" | "MODERATE" | "REMOVE" | "REINSTATE" | null>(null);
  const [actionReason, setActionReason] = useState("");
  const [isApproving, setIsApproving] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadListings = React.useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await apiFetch(`${API_BASE}/api/v1/ops/listings`);
      if (res.ok) {
        const data = await res.json();
        setListings(Array.isArray(data) ? data : []);
      } else {
        throw new Error(`Failed to fetch listings (${res.status})`);
      }
    } catch (err: unknown) {
      console.warn("Could not fetch ops listings, using fallback view:", err);
      const msg = err instanceof Error ? err.message : "Failed to load listings";
      setErrorMessage(msg);
      setListings([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    async function init() {
      try {
        const res = await apiFetch(`${API_BASE}/api/v1/ops/listings`);
        if (res.ok) {
          const data = await res.json();
          if (!ignore) setListings(Array.isArray(data) ? data : []);
        } else {
          throw new Error(`Failed to fetch listings (${res.status})`);
        }
      } catch (err: unknown) {
        console.warn("Could not fetch ops listings, using fallback view:", err);
        const msg = err instanceof Error ? err.message : "Failed to load listings";
        if (!ignore) {
          setErrorMessage(msg);
          setListings([]);
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    void init();
    return () => {
      ignore = true;
    };
  }, []);

  async function handleModerate(listingId: string, approved: boolean, reason: string) {
    setSubmitting(true);
    try {
      const res = await apiFetch(`${API_BASE}/api/v1/ops/listings/${listingId}/moderate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved, reason }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { detail?: string }).detail || "Moderation action failed.");
      }
      closeModal();
      await loadListings();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Moderation action failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemove(listingId: string, reason: string) {
    if (!reason.trim()) {
      alert("A removal reason is required.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch(`${API_BASE}/api/v1/ops/listings/${listingId}/remove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { detail?: string }).detail || "Takedown failed.");
      }
      closeModal();
      await loadListings();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Takedown failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReinstate(listingId: string, reason: string) {
    setSubmitting(true);
    try {
      const res = await apiFetch(`${API_BASE}/api/v1/ops/listings/${listingId}/reinstate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { detail?: string }).detail || "Reinstatement failed.");
      }
      closeModal();
      await loadListings();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Reinstatement failed.");
    } finally {
      setSubmitting(false);
    }
  }

  function closeModal() {
    setSelectedListing(null);
    setModalAction(null);
    setActionReason("");
  }

  // Filter & Search Logic
  const filteredListings = listings.filter((item) => {
    if (filter === "PENDING") {
      if (item.moderation_status !== "PENDING" && item.status !== "SUBMITTED_FOR_MODERATION") return false;
    } else if (filter === "ACTIVE") {
      if (item.status !== "PUBLISHED") return false;
    } else if (filter === "REMOVED") {
      if (item.status !== "REMOVED" && item.moderation_status !== "REMOVED") return false;
    } else if (filter === "DRAFT") {
      if (item.status !== "DRAFT") return false;
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
    (l) => l.moderation_status === "PENDING" || l.status === "SUBMITTED_FOR_MODERATION"
  ).length;
  const activeCount = listings.filter((l) => l.status === "PUBLISHED").length;
  const removedCount = listings.filter((l) => l.status === "REMOVED" || l.moderation_status === "REMOVED").length;

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
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
            onClick={loadListings}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin text-orange-600" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <AlertTriangle className="size-5 shrink-0 text-amber-600" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="rounded-lg bg-blue-50 p-3 text-blue-600">
            <BriefcaseBusiness className="size-6" />
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-900">{listings.length}</div>
            <div className="text-xs font-medium text-slate-500">Total Postings</div>
          </div>
        </div>

        <div
          onClick={() => setFilter("PENDING")}
          className={`flex cursor-pointer items-center gap-4 rounded-xl border p-4 shadow-sm transition-all ${
            pendingCount > 0
              ? "border-amber-300 bg-amber-50/70 hover:bg-amber-100/50"
              : "border-slate-200 bg-white hover:bg-slate-50"
          }`}
        >
          <div className={`rounded-lg p-3 ${pendingCount > 0 ? "bg-amber-200 text-amber-900" : "bg-slate-100 text-slate-600"}`}>
            <Clock className="size-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-slate-900">{pendingCount}</span>
              {pendingCount > 0 && (
                <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">
                  Action Needed
                </span>
              )}
            </div>
            <div className="text-xs font-medium text-slate-600">Pending Moderation</div>
          </div>
        </div>

        <div
          onClick={() => setFilter("ACTIVE")}
          className="flex cursor-pointer items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:bg-slate-50"
        >
          <div className="rounded-lg bg-emerald-50 p-3 text-emerald-600">
            <CheckCircle2 className="size-6" />
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-900">{activeCount}</div>
            <div className="text-xs font-medium text-slate-500">Active / Published</div>
          </div>
        </div>

        <div
          onClick={() => setFilter("REMOVED")}
          className="flex cursor-pointer items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:bg-slate-50"
        >
          <div className="rounded-lg bg-rose-50 p-3 text-rose-600">
            <ShieldAlert className="size-6" />
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-900">{removedCount}</div>
            <div className="text-xs font-medium text-slate-500">Takedowns / Removed</div>
          </div>
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: "ALL", label: "All Listings" },
            { id: "PENDING", label: `Pending Review (${pendingCount})` },
            { id: "ACTIVE", label: "Published" },
            { id: "DRAFT", label: "Drafts" },
            { id: "REMOVED", label: `Removed (${removedCount})` },
            { id: "CLOSED", label: "Closed / Expired" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                filter === tab.id
                  ? "bg-slate-900 text-white shadow"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search title, location, phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-slate-200 py-1.5 pl-9 pr-3 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
        </div>
      </div>

      {/* Listings Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3.5">Listing Info</th>
                <th className="px-4 py-3.5">Role & Compensation</th>
                <th className="px-4 py-3.5">Contact Details</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5">Applications</th>
                <th className="px-4 py-3.5">Created</th>
                <th className="px-4 py-3.5 text-right">Moderation Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && listings.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                    <RefreshCw className="mx-auto mb-2 size-6 animate-spin text-orange-600" />
                    Loading listings from operations catalog...
                  </td>
                </tr>
              ) : filteredListings.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                    <BriefcaseBusiness className="mx-auto mb-2 size-8 text-slate-300" />
                    No listings found matching the current filter.
                  </td>
                </tr>
              ) : (
                filteredListings.map((listing) => {
                  const isPending =
                    listing.moderation_status === "PENDING" || listing.status === "SUBMITTED_FOR_MODERATION";
                  const isRemoved = listing.status === "REMOVED" || listing.moderation_status === "REMOVED";
                  const isPublished = listing.status === "PUBLISHED";

                  return (
                    <tr key={listing.id} className="hover:bg-slate-50/75">
                      <td className="px-4 py-3.5">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5 font-semibold text-slate-900">
                            {listing.is_premium && (
                              <span title="Featured / Premium Listing">
                                <Crown className="size-4 text-amber-500 fill-amber-400" />
                              </span>
                            )}
                            <span>{listing.title}</span>
                          </div>
                          {listing.location_text && (
                            <div className="flex items-center gap-1 text-xs text-slate-500">
                              <MapPin className="size-3 text-slate-400" />
                              <span>{listing.location_text}</span>
                            </div>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="flex flex-col gap-1 text-xs">
                          {listing.structured_fields?.pay_range && (
                            <span className="font-semibold text-slate-800">
                              {listing.structured_fields.pay_range}
                            </span>
                          )}
                          <div className="flex flex-wrap items-center gap-1">
                            {listing.structured_fields?.role_type && (
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600">
                                {listing.structured_fields.role_type}
                              </span>
                            )}
                            {listing.structured_fields?.work_mode && (
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">
                                {listing.structured_fields.work_mode}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="flex flex-col gap-0.5 text-xs text-slate-600">
                          {listing.contact_phone ? (
                            <div className="flex items-center gap-1">
                              <Phone className="size-3 text-slate-400" />
                              <span>{listing.contact_phone}</span>
                            </div>
                          ) : (
                            <span className="italic text-slate-400">No phone</span>
                          )}
                          {listing.contact_email && (
                            <div className="flex items-center gap-1 text-slate-500">
                              <Mail className="size-3 text-slate-400" />
                              <span className="truncate max-w-[140px]">{listing.contact_email}</span>
                            </div>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="flex flex-col gap-1">
                          {isPending && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 border border-amber-200">
                              <Clock className="size-3" />
                              Needs Review
                            </span>
                          )}
                          {isPublished && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="size-3" />
                              Published
                            </span>
                          )}
                          {isRemoved && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 border border-rose-200">
                              <ShieldAlert className="size-3" />
                              Removed
                            </span>
                          )}
                          {!isPending && !isPublished && !isRemoved && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                              {listing.status}
                            </span>
                          )}
                          {listing.moderation_reason && (
                            <span className="text-[11px] text-slate-500 line-clamp-1" title={listing.moderation_reason}>
                              Note: {listing.moderation_reason}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3.5">
                        <span className="font-semibold text-slate-900">
                          {listing.application_count}
                        </span>
                        <span className="text-xs text-slate-500 ml-1">candidates</span>
                      </td>

                      <td className="px-4 py-3.5 text-xs text-slate-500">
                        {new Date(listing.created_at).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>

                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => {
                              setSelectedListing(listing);
                              setModalAction("VIEW");
                            }}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                            title="View full listing details"
                          >
                            <Eye className="size-4" />
                          </button>

                          {isPending && (
                            <button
                              onClick={() => {
                                setSelectedListing(listing);
                                setIsApproving(true);
                                setActionReason("");
                                setModalAction("MODERATE");
                              }}
                              className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
                            >
                              Review & Decide
                            </button>
                          )}

                          {isPublished && (
                            <button
                              onClick={() => {
                                setSelectedListing(listing);
                                setActionReason("");
                                setModalAction("REMOVE");
                              }}
                              className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                            >
                              Takedown
                            </button>
                          )}

                          {isRemoved && (
                            <button
                              onClick={() => {
                                setSelectedListing(listing);
                                setActionReason("Verified compliant by operations");
                                setModalAction("REINSTATE");
                              }}
                              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              Reinstate
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: View Details */}
      {modalAction === "VIEW" && selectedListing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div className="flex items-center gap-2">
                <BriefcaseBusiness className="size-5 text-orange-600" />
                <h3 className="font-bold text-slate-900">Listing Details</h3>
              </div>
              <button onClick={closeModal} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                <X className="size-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4 text-sm">
              <div>
                <div className="text-xs font-semibold uppercase text-slate-400">Job Title</div>
                <div className="text-lg font-bold text-slate-900 mt-0.5">{selectedListing.title}</div>
              </div>

              <div className="grid grid-cols-2 gap-4 rounded-xl bg-slate-50 p-4">
                <div>
                  <span className="text-xs text-slate-500">Status</span>
                  <div className="font-semibold text-slate-800 mt-0.5">{selectedListing.status}</div>
                </div>
                <div>
                  <span className="text-xs text-slate-500">Moderation Status</span>
                  <div className="font-semibold text-slate-800 mt-0.5">{selectedListing.moderation_status}</div>
                </div>
                <div>
                  <span className="text-xs text-slate-500">Location</span>
                  <div className="font-semibold text-slate-800 mt-0.5">{selectedListing.location_text || "Remote / Unspecified"}</div>
                </div>
                <div>
                  <span className="text-xs text-slate-500">Applications</span>
                  <div className="font-semibold text-slate-800 mt-0.5">{selectedListing.application_count} applicants</div>
                </div>
              </div>

              {selectedListing.structured_fields && (
                <div>
                  <div className="text-xs font-semibold uppercase text-slate-400 mb-2">Structured Fields</div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {Object.entries(selectedListing.structured_fields).map(([k, v]) => (
                      <div key={k} className="rounded border border-slate-200 px-2.5 py-1.5">
                        <span className="font-medium text-slate-500 capitalize">{k.replace("_", " ")}: </span>
                        <span className="font-semibold text-slate-800">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="text-xs font-semibold uppercase text-slate-400 mb-1">Description</div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 whitespace-pre-wrap text-slate-700 text-xs leading-relaxed">
                  {selectedListing.description}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-4 space-y-2">
                <div className="text-xs font-semibold uppercase text-slate-400">Poster Contact Details</div>
                <div className="flex items-center gap-4 text-xs">
                  <div>Phone: <span className="font-semibold text-slate-800">{selectedListing.contact_phone || "None"}</span></div>
                  <div>Email: <span className="font-semibold text-slate-800">{selectedListing.contact_email || "None"}</span></div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-6 py-3">
              <button
                onClick={closeModal}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Moderation Decision */}
      {modalAction === "MODERATE" && selectedListing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="flex w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-5 text-orange-600" />
                <h3 className="font-bold text-slate-900">Moderation Decision</h3>
              </div>
              <button onClick={closeModal} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                <X className="size-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-sm">
              <div>
                <span className="text-xs text-slate-500">Listing</span>
                <div className="font-bold text-slate-900 mt-0.5">{selectedListing.title}</div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsApproving(true)}
                  className={`flex-1 rounded-xl border p-3 text-center text-sm font-semibold transition-all ${
                    isApproving
                      ? "border-emerald-500 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-500"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <CheckCircle2 className="mx-auto mb-1 size-5 text-emerald-600" />
                  Approve Listing
                </button>
                <button
                  type="button"
                  onClick={() => setIsApproving(false)}
                  className={`flex-1 rounded-xl border p-3 text-center text-sm font-semibold transition-all ${
                    !isApproving
                      ? "border-rose-500 bg-rose-50 text-rose-800 ring-2 ring-rose-500"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <XCircle className="mx-auto mb-1 size-5 text-rose-600" />
                  Reject / Return to Draft
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {isApproving ? "Approval Note (Optional)" : "Rejection Reason (Required)"}
                </label>
                <textarea
                  rows={3}
                  placeholder={
                    isApproving
                      ? "e.g. Verified standard job posting"
                      : "Explain why this posting was rejected so employer can amend and resubmit"
                  }
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 p-2.5 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-6 py-3">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting || (!isApproving && !actionReason.trim())}
                onClick={() => handleModerate(selectedListing.id, isApproving, actionReason)}
                className={`rounded-lg px-4 py-2 text-xs font-bold text-white shadow-sm disabled:opacity-50 ${
                  isApproving ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"
                }`}
              >
                {submitting ? "Processing..." : isApproving ? "Confirm Approval" : "Confirm Rejection"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Takedown / Removal */}
      {modalAction === "REMOVE" && selectedListing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="flex w-full max-w-md flex-col rounded-2xl bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div className="flex items-center gap-2 text-rose-600">
                <ShieldAlert className="size-5" />
                <h3 className="font-bold text-slate-900">Take Down Listing</h3>
              </div>
              <button onClick={closeModal} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                <X className="size-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-sm">
              <p className="text-slate-600">
                Taking down <strong className="text-slate-900">{selectedListing.title}</strong> will immediately withdraw it from public search and notify the employer.
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Policy Violation Reason (Required)
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. Fraudulent recruitment, reported abuse, or scam job offer"
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 p-2.5 text-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-6 py-3">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting || !actionReason.trim()}
                onClick={() => handleRemove(selectedListing.id, actionReason)}
                className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-rose-700 disabled:opacity-50"
              >
                {submitting ? "Removing..." : "Execute Takedown"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Reinstate */}
      {modalAction === "REINSTATE" && selectedListing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="flex w-full max-w-md flex-col rounded-2xl bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div className="flex items-center gap-2 text-slate-800">
                <CheckCircle2 className="size-5 text-emerald-600" />
                <h3 className="font-bold text-slate-900">Reinstate Listing</h3>
              </div>
              <button onClick={closeModal} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                <X className="size-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-sm">
              <p className="text-slate-600">
                Reinstate <strong className="text-slate-900">{selectedListing.title}</strong> back to active circulation.
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Reinstatement Note
                </label>
                <textarea
                  rows={3}
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 p-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-6 py-3">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleReinstate(selectedListing.id, actionReason)}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
              >
                {submitting ? "Reinstating..." : "Confirm Reinstatement"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
