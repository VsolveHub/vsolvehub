"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  Crown,
  MapPin,
  Pencil,
  Phone,
  Plus,
  RotateCcw,
  Send,
  Users,
  X,
  XCircle,
} from "lucide-react";

import {
  completePaymentAttempt,
  createPartnerListing,
  fetchCareerServices,
  fetchPartnerListingHome,
  fetchPartnerListings,
  fetchSubscriptionPlans,
  listingFields,
  purchaseSubscription,
  runListingAction,
  updatePartnerListing,
  type PartnerListing,
  type VendorSubscriptionPlan,
} from "@/features/listings/queries";

const STATUS_BADGES: Record<string, { label: string; bg: string; text: string; border: string }> = {
  DRAFT: { label: "Draft", bg: "bg-slate-100", text: "text-slate-700", border: "border-slate-200" },
  PENDING_REVIEW: {
    label: "In Review",
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
  },
  REJECTED: {
    label: "Rejected",
    bg: "bg-rose-50",
    text: "text-rose-700",
    border: "border-rose-200",
  },
  PUBLISHED: {
    label: "Live & Active",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200",
  },
  CLOSED: { label: "Closed", bg: "bg-slate-100", text: "text-slate-600", border: "border-slate-200" },
  REMOVED: { label: "Removed", bg: "bg-rose-100", text: "text-rose-800", border: "border-rose-200" },
  EXPIRED: { label: "Expired", bg: "bg-gray-100", text: "text-gray-600", border: "border-gray-200" },
  ARCHIVED: { label: "Archived", bg: "bg-gray-100", text: "text-gray-600", border: "border-gray-200" },
};

export default function PartnerListingsPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<string>("ALL");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingListing, setEditingListing] = useState<PartnerListing | null>(null);
  const [isSubscriptionModalOpen, setIsSubscriptionModalOpen] = useState(false);

  const { data: home } = useQuery({
    queryKey: ["partner-listing-home"],
    queryFn: fetchPartnerListingHome,
  });

  const { data: listings = [], isLoading } = useQuery({
    queryKey: ["partner-listings"],
    queryFn: fetchPartnerListings,
  });

  const { data: services = [] } = useQuery({
    queryKey: ["career-services"],
    queryFn: fetchCareerServices,
  });

  const { data: plans = [] } = useQuery({
    queryKey: ["listing-subscription-plans"],
    queryFn: fetchSubscriptionPlans,
  });

  const [form, setForm] = useState({
    service_id: "",
    variant: "",
    title: "",
    description: "",
    location_text: "",
    contact_phone: "",
    contact_email: "",
    role_type: "Full-Time",
    pay_range: "₹25,000 - ₹40,000 / month",
    work_mode: "On-site",
    experience_years: "1-3 years",
  });

  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    location_text: "",
    contact_phone: "",
    contact_email: "",
    role_type: "Full-Time",
    pay_range: "₹25,000 - ₹40,000 / month",
    work_mode: "On-site",
    experience_years: "1-3 years",
  });

  const handleStartEdit = (listing: PartnerListing) => {
    setEditingListing(listing);
    setEditForm({
      title: listing.title || "",
      description: listing.description || "",
      location_text: listing.location_text || "",
      contact_phone: listing.contact_phone || "",
      contact_email: listing.contact_email || "",
      role_type: String(listingFields(listing.structured_fields).role_type || "Full-Time"),
      pay_range: String(listingFields(listing.structured_fields).pay_range || ""),
      work_mode: String(listingFields(listing.structured_fields).work_mode || "On-site"),
      experience_years: String(listingFields(listing.structured_fields).experience_years || ""),
    });
  };

  const update = useMutation({
    mutationFn: () => {
      if (!editingListing) throw new Error("No listing selected for editing");
      return updatePartnerListing(editingListing.id, {
        title: editForm.title,
        description: editForm.description,
        location_text: editForm.location_text,
        contact_phone: editForm.contact_phone,
        contact_email: editForm.contact_email || undefined,
        structured_fields: {
          role_type: editForm.role_type,
          pay_range: editForm.pay_range,
          work_mode: editForm.work_mode,
          experience_years: editForm.experience_years,
        },
      });
    },
    onSuccess: () => {
      setEditingListing(null);
      queryClient.invalidateQueries({ queryKey: ["partner-listings"] });
      queryClient.invalidateQueries({ queryKey: ["partner-listing-home"] });
    },
  });

  const handleServiceChange = (serviceId: string) => {
    const selected = services.find((s) => s.id === serviceId);
    const firstVariant = selected?.variants?.[0]?.id || "";
    setForm((prev) => ({
      ...prev,
      service_id: serviceId,
      variant: firstVariant,
      title: prev.title || (selected ? `Hiring: ${selected.name}` : ""),
    }));
  };

  const create = useMutation({
    mutationFn: () =>
      createPartnerListing({
        variant: form.variant || undefined,
        service_id: form.service_id || undefined,
        title: form.title,
        description: form.description,
        location_text: form.location_text,
        contact_phone: form.contact_phone,
        contact_email: form.contact_email || undefined,
        structured_fields: {
          role_type: form.role_type,
          pay_range: form.pay_range,
          work_mode: form.work_mode,
          experience_years: form.experience_years,
        },
      }),
    onSuccess: () => {
      setIsCreateOpen(false);
      setForm({
        service_id: "",
        variant: "",
        title: "",
        description: "",
        location_text: "",
        contact_phone: "",
        contact_email: "",
        role_type: "Full-Time",
        pay_range: "₹25,000 - ₹40,000 / month",
        work_mode: "On-site",
        experience_years: "1-3 years",
      });
      queryClient.invalidateQueries({ queryKey: ["partner-listings"] });
      queryClient.invalidateQueries({ queryKey: ["partner-listing-home"] });
    },
  });

  const action = useMutation({
    mutationFn: ({
      id,
      next,
      reason,
    }: {
      id: string;
      next: "submit" | "publish" | "republish" | "close";
      reason?: string;
    }) => runListingAction(id, next, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["partner-listings"] });
      queryClient.invalidateQueries({ queryKey: ["partner-listing-home"] });
    },
  });

  const subscribe = useMutation({
    mutationFn: async (planId: string) => {
      const sub = await purchaseSubscription(planId);
      if (sub.payment_attempt_id) {
        try {
          await completePaymentAttempt(sub.payment_attempt_id);
        } catch (err) {
          console.warn("Auto-capture subscription warning:", err);
        }
      }
      return sub;
    },
    onSuccess: () => {
      setIsSubscriptionModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["partner-listing-home"] });
      queryClient.invalidateQueries({ queryKey: ["partner-listings"] });
    },
  });

  const filteredListings = listings.filter((item) => {
    const state = item.public_state || item.status;
    if (activeTab === "ALL") return true;
    if (activeTab === "ACTIVE") return state === "PUBLISHED";
    if (activeTab === "REVIEW") return state === "PENDING_REVIEW" || item.moderation_status === "PENDING";
    if (activeTab === "DRAFT") return state === "DRAFT";
    if (activeTab === "CLOSED") return ["CLOSED", "EXPIRED", "REMOVED", "ARCHIVED"].includes(state);
    return state === activeTab;
  });

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8">
      {/* Workspace Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-indigo-600 uppercase tracking-wider">
            <BriefcaseBusiness className="h-3.5 w-3.5" /> Hiring Partner Workspace
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
            Career Listings & Applicants
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Publish openings, review incoming applicant leads, and manage hiring subscriptions.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setIsSubscriptionModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-xs transition hover:border-slate-300 hover:bg-slate-50"
          >
            <Crown className="h-4 w-4 text-amber-500" />
            {home?.subscription ? home.subscription.plan_name : "Subscription Plans"}
          </button>

          <button
            onClick={() => setIsCreateOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" />
            Post New Opening
          </button>
        </div>
      </div>

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="text-xs font-medium text-slate-500">Active Listings</div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-950">{home?.active_listings ?? 0}</span>
            {home?.plan_limit ? (
              <span className="text-xs text-slate-400">/ {home.plan_limit} quota</span>
            ) : null}
          </div>
          <div className="mt-2 text-[11px] text-emerald-600 font-medium">Live on platform</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="text-xs font-medium text-slate-500">Pending Review</div>
          <div className="mt-1.5 text-2xl font-bold text-slate-950">
            {home?.pending_moderation ?? 0}
          </div>
          <div className="mt-2 text-[11px] text-amber-600 font-medium">In moderation</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="text-xs font-medium text-slate-500">Applicant Leads</div>
          <div className="mt-1.5 text-2xl font-bold text-slate-950">
            {home?.new_applications ?? 0}
          </div>
          <div className="mt-2 text-[11px] text-indigo-600 font-medium">Candidate profiles</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="text-xs font-medium text-slate-500">Hiring Subscription</div>
          <div className="mt-1.5 text-sm font-bold text-slate-950">
            {home?.subscription ? home.subscription.plan_name : "Free / Trial"}
          </div>
          <div className="mt-2 text-[11px] text-slate-400">
            {home?.subscription?.ends_at
              ? `Renews ${new Date(home.subscription.ends_at).toLocaleDateString()}`
              : "No active plan"}
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
        {[
          { key: "ALL", label: "All Listings" },
          { key: "ACTIVE", label: "Live Active" },
          { key: "REVIEW", label: "Under Review" },
          { key: "DRAFT", label: "Drafts" },
          { key: "CLOSED", label: "Closed / Expired" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
              activeTab === tab.key
                ? "bg-slate-950 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Action mutation errors */}
      {action.error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          {(action.error as Error).message}
        </div>
      )}

      {/* Listings list */}
      <div className="grid gap-4">
        {isLoading ? (
          <div className="py-12 text-center text-sm text-slate-400">Loading workspace listings...</div>
        ) : null}

        {!isLoading && filteredListings.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 p-16 text-center">
            <BriefcaseBusiness className="h-12 w-12 text-slate-300" />
            <h3 className="mt-3 text-base font-semibold text-slate-900">No listings in this view</h3>
            <p className="mt-1 text-sm text-slate-500">
              Create a new opening to start collecting candidate applications.
            </p>
            <button
              onClick={() => setIsCreateOpen(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4" /> Create Opening
            </button>
          </div>
        ) : null}

        {filteredListings.map((listing) => {
          const cfg = STATUS_BADGES[listing.public_state || listing.status] || {
            label: listing.status,
            bg: "bg-slate-100",
            text: "text-slate-700",
            border: "border-slate-200",
          };

          return (
            <article
              key={listing.id}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs transition hover:border-slate-300"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cfg.bg} ${cfg.text} ${cfg.border}`}
                    >
                      {cfg.label}
                    </span>

                    {listing.moderation_status === "APPROVED" && listing.status !== "PUBLISHED" && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                        <CheckCircle2 className="h-3 w-3" /> Moderation Approved
                      </span>
                    )}

                    {listing.service_name && (
                      <span className="text-xs text-slate-400">• {listing.service_name}</span>
                    )}

                    <span className="text-xs text-slate-400">
                      • Created {new Date(listing.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  <h2 className="text-lg font-bold text-slate-950">{listing.title}</h2>
                  <p className="line-clamp-2 text-sm text-slate-600">{listing.description}</p>

                  <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5 text-slate-400" />
                      {listing.location_text || "Location on contact"}
                    </span>
                    <span className="flex items-center gap-1">
                      <Phone className="h-3.5 w-3.5 text-slate-400" />
                      {listing.contact_phone}
                    </span>
                  </div>

                  {listing.moderation_reason && (
                    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
                      <span className="font-semibold">Moderation Note:</span> {listing.moderation_reason}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-wrap items-center gap-2 pt-2 lg:pt-0 lg:flex-col lg:items-end">
                  <Link
                    href={`/listings/${listing.id}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    <Users className="h-3.5 w-3.5 text-indigo-600" />
                    View Leads ({listing.application_count})
                  </Link>

                  {["DRAFT", "PUBLISHED"].includes(listing.status) && (
                    <button
                      onClick={() => handleStartEdit(listing)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      <Pencil className="h-3.5 w-3.5 text-slate-500" /> Edit Opening
                    </button>
                  )}

                  {listing.status === "DRAFT" && (
                    <button
                      onClick={() => action.mutate({ id: listing.id, next: "submit" })}
                      disabled={action.isPending}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-indigo-700"
                    >
                      <Send className="h-3.5 w-3.5" /> Submit for Review
                    </button>
                  )}

                  {listing.moderation_status === "APPROVED" && listing.status !== "PUBLISHED" && (
                    <button
                      onClick={() => action.mutate({ id: listing.id, next: "publish" })}
                      disabled={action.isPending}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700"
                    >
                      <Check className="h-3.5 w-3.5" /> Publish Live
                    </button>
                  )}

                  {listing.status === "PUBLISHED" && (
                    <button
                      onClick={() =>
                        action.mutate({
                          id: listing.id,
                          next: "close",
                          reason: "Filled position or partner closed",
                        })
                      }
                      disabled={action.isPending}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                    >
                      <XCircle className="h-3.5 w-3.5 text-slate-400" /> Close Listing
                    </button>
                  )}

                  {["CLOSED", "EXPIRED"].includes(listing.status) && (
                    <button
                      onClick={() => action.mutate({ id: listing.id, next: "republish" })}
                      disabled={action.isPending}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Republish
                    </button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {/* Create Listing Modal / Drawer */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="my-8 w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-950">Create Career Opportunity</h2>
                <p className="text-xs text-slate-500">
                  Fill in the details below. New postings undergo review before going live.
                </p>
              </div>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              className="mt-5 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                create.mutate();
              }}
            >
              {/* Category Service Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Career Role / Service <span className="text-rose-500">*</span>
                </label>
                <select
                  value={form.service_id}
                  onChange={(e) => handleServiceChange(e.target.value)}
                  required
                  className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-indigo-500"
                >
                  <option value="">Select a career role...</option>
                  {services.map((svc) => (
                    <option key={svc.id} value={svc.id}>
                      {svc.name}
                    </option>
                  ))}
                </select>
                {!form.variant && (
                  <p className="mt-1 text-[11px] text-slate-400">
                    Select a service from the catalog to configure the role variant.
                  </p>
                )}
              </div>

              {/* Title */}
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Listing Title <span className="text-rose-500">*</span>
                </label>
                <input
                  value={form.title}
                  onChange={(e) => setForm((c) => ({ ...c, title: e.target.value }))}
                  required
                  placeholder="e.g. Senior Python / React Developer"
                  className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-indigo-500"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Job Description & Requirements <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((c) => ({ ...c, description: e.target.value }))}
                  required
                  rows={4}
                  placeholder="Describe key responsibilities, qualifications, requirements, and shift timings..."
                  className="mt-1 w-full rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-indigo-500"
                />
              </div>

              {/* Grid 2 cols */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Location Text <span className="text-rose-500">*</span>
                  </label>
                  <input
                    value={form.location_text}
                    onChange={(e) => setForm((c) => ({ ...c, location_text: e.target.value }))}
                    required
                    placeholder="e.g. Indiranagar, Bengaluru / Remote"
                    className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Contact Phone <span className="text-rose-500">*</span>
                  </label>
                  <input
                    value={form.contact_phone}
                    onChange={(e) => setForm((c) => ({ ...c, contact_phone: e.target.value }))}
                    required
                    placeholder="+91 99000 00088"
                    className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Role Type / Employment
                  </label>
                  <select
                    value={form.role_type}
                    onChange={(e) => setForm((c) => ({ ...c, role_type: e.target.value }))}
                    className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-indigo-500"
                  >
                    <option value="Full-Time">Full-Time</option>
                    <option value="Part-Time">Part-Time</option>
                    <option value="Contract">Contract</option>
                    <option value="Internship">Internship</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Pay Range / Compensation
                  </label>
                  <input
                    value={form.pay_range}
                    onChange={(e) => setForm((c) => ({ ...c, pay_range: e.target.value }))}
                    placeholder="e.g. ₹35,000 - ₹50,000 / month"
                    className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Workplace Mode
                  </label>
                  <select
                    value={form.work_mode}
                    onChange={(e) => setForm((c) => ({ ...c, work_mode: e.target.value }))}
                    className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-indigo-500"
                  >
                    <option value="On-site">On-site</option>
                    <option value="Hybrid">Hybrid</option>
                    <option value="Remote">Remote</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Experience Required
                  </label>
                  <input
                    value={form.experience_years}
                    onChange={(e) => setForm((c) => ({ ...c, experience_years: e.target.value }))}
                    placeholder="e.g. 2+ years"
                    className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {create.error && (
                <p className="text-xs text-red-600">{(create.error as Error).message}</p>
              )}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={create.isPending || !form.variant}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2 text-xs font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
                >
                  {create.isPending ? "Creating..." : "Save Draft"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Listing Modal */}
      {editingListing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="my-8 w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-950">Edit Career Opening</h2>
                <p className="text-xs text-slate-500">
                  Update details for this opening ({editingListing.title}).
                </p>
              </div>
              <button
                onClick={() => setEditingListing(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              className="mt-5 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                update.mutate();
              }}
            >
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Job / Role Title <span className="text-rose-500">*</span>
                </label>
                <input
                  required
                  value={editForm.title}
                  onChange={(e) => setEditForm((c) => ({ ...c, title: e.target.value }))}
                  className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Detailed Description <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={4}
                  value={editForm.description}
                  onChange={(e) => setEditForm((c) => ({ ...c, description: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Location / Work City
                  </label>
                  <input
                    value={editForm.location_text}
                    onChange={(e) => setEditForm((c) => ({ ...c, location_text: e.target.value }))}
                    className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Direct Contact Phone <span className="text-rose-500">*</span>
                  </label>
                  <input
                    required
                    value={editForm.contact_phone}
                    onChange={(e) => setEditForm((c) => ({ ...c, contact_phone: e.target.value }))}
                    className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Contact Email</label>
                  <input
                    type="email"
                    value={editForm.contact_email}
                    onChange={(e) => setEditForm((c) => ({ ...c, contact_email: e.target.value }))}
                    className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">Employment Type</label>
                  <select
                    value={editForm.role_type}
                    onChange={(e) => setEditForm((c) => ({ ...c, role_type: e.target.value }))}
                    className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-500"
                  >
                    <option value="Full-Time">Full-Time</option>
                    <option value="Part-Time">Part-Time</option>
                    <option value="Contract">Contract</option>
                    <option value="Internship">Internship</option>
                  </select>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Work Mode</label>
                  <select
                    value={editForm.work_mode}
                    onChange={(e) => setEditForm((c) => ({ ...c, work_mode: e.target.value }))}
                    className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-500"
                  >
                    <option value="On-site">On-site</option>
                    <option value="Hybrid">Hybrid</option>
                    <option value="Remote">Remote</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">Pay / Salary Range</label>
                  <input
                    value={editForm.pay_range}
                    onChange={(e) => setEditForm((c) => ({ ...c, pay_range: e.target.value }))}
                    className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">Experience Required</label>
                  <input
                    value={editForm.experience_years}
                    onChange={(e) => setEditForm((c) => ({ ...c, experience_years: e.target.value }))}
                    className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {update.error && (
                <p className="text-xs text-red-600">{(update.error as Error).message}</p>
              )}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingListing(null)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={update.isPending || !editForm.title}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2 text-xs font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
                >
                  {update.isPending ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Subscription Plans Modal */}
      {isSubscriptionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="my-8 w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-950 flex items-center gap-2">
                  <Crown className="h-5 w-5 text-amber-500" />
                  Hiring Subscription Plans
                </h2>
                <p className="text-xs text-slate-500">
                  Upgrade your listing capacity and unlock premium featured placements.
                </p>
              </div>
              <button
                onClick={() => setIsSubscriptionModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              {plans.map((plan: VendorSubscriptionPlan) => {
                const priceInRupees = plan.price_paise / 100;
                const isCurrent = home?.subscription?.plan_name === plan.name;

                return (
                  <div
                    key={plan.id}
                    className={`flex flex-col justify-between rounded-xl border p-5 transition ${
                      isCurrent
                        ? "border-amber-400 bg-amber-50/30 ring-1 ring-amber-400"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold text-slate-950">{plan.name}</h3>
                        {isCurrent && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                            Active
                          </span>
                        )}
                      </div>

                      <div className="mt-3 text-2xl font-extrabold text-slate-950">
                        ₹{priceInRupees.toLocaleString()}
                        <span className="text-xs font-normal text-slate-500">
                          {" "}/ {plan.duration_days} days
                        </span>
                      </div>

                      <ul className="mt-4 space-y-2 text-xs text-slate-600">
                        <li className="flex items-center gap-2">
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                          <span>
                            Up to <strong>{plan.max_active_listings}</strong> active listings
                          </span>
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                          <span>Direct candidate contact unlock</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                          <span>Candidate lead status tracker</span>
                        </li>
                      </ul>
                    </div>

                    <button
                      onClick={() => subscribe.mutate(plan.id)}
                      disabled={subscribe.isPending || isCurrent}
                      className={`mt-6 w-full rounded-lg py-2 text-xs font-semibold transition ${
                        isCurrent
                          ? "bg-slate-100 text-slate-400 cursor-default"
                          : "bg-indigo-600 text-white hover:bg-indigo-700"
                      }`}
                    >
                      {isCurrent ? "Current Plan" : subscribe.isPending ? "Activating..." : "Subscribe"}
                    </button>
                  </div>
                );
              })}
            </div>

            {subscribe.error && (
              <p className="mt-4 text-xs text-red-600">{(subscribe.error as Error).message}</p>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
