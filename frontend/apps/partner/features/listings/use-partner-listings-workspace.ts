import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  createListingSchema,
  editListingSchema,
  issuesToFieldErrors,
  type CreateListingFormState,
  type EditListingFormState,
  type TabKey,
} from "./model";
import {
  fetchCareerServices,
  fetchPartnerListingHome,
  fetchPartnerListings,
  fetchSubscriptionPlans,
  listingFields,
  type PartnerListing,
} from "./queries";
import { usePartnerListingMutations } from "./use-partner-listing-mutations";

const INITIAL_FORM: CreateListingFormState = {
  service_id: "",
  variant: "",
  title: "",
  description: "",
  location_text: "",
  contact_phone: "",
  contact_email: "",
  role_type: "",
  salary_min_rupees: "",
  salary_max_rupees: "",
  salary_period: "",
  shift: "",
  experience_years: "",
};

export function usePartnerListingsWorkspace() {
  const [activeTab, setActiveTab] = useState<TabKey>("ALL");
  const [actionError, setActionError] = useState<string | null>(null);
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

  const [form, setForm] = useState<CreateListingFormState>(INITIAL_FORM);
  const [editForm, setEditForm] = useState<EditListingFormState>(INITIAL_FORM);
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});

  const handleStartEdit = (listing: PartnerListing) => {
    setEditingListing(listing);
    const fields = listingFields(listing.structured_fields);
    const shiftVal = String(fields.shift || fields.work_mode || "");
    const minR = listing.salary_min_paise ? String(listing.salary_min_paise / 100) : "";
    const maxR = listing.salary_max_paise ? String(listing.salary_max_paise / 100) : "";
    
    setEditForm({
      title: listing.title || "",
      description: listing.description || "",
      location_text: listing.location_text || "",
      contact_phone: listing.contact_phone || "",
      contact_email: listing.contact_email || "",
      role_type: String(fields.role_type || ""),
      salary_min_rupees: minR,
      salary_max_rupees: maxR,
      salary_period: listing.salary_period || "",
      shift: shiftVal,
      experience_years: String(fields.experience_years || ""),
    });
  };

  const { create, update, action, subscribe } = usePartnerListingMutations({
    editingListing,
    form,
    editForm,
    onUpdateSuccess: () => {
      setEditErrors({});
      setEditingListing(null);
    },
    onCreateSuccess: () => {
      setIsCreateOpen(false);
      setCreateErrors({});
      setForm(INITIAL_FORM);
    },
    onActionSuccess: () => {
      setActionError(null);
    },
    onSubscribeSuccess: () => {
      setIsSubscriptionModalOpen(false);
      setActionError(null);
    },
    onPlanCap: () => {
      setIsSubscriptionModalOpen(true);
    },
    setCreateErrors,
    setEditErrors,
    setActionError,
  });

  const handleCreate = () => {
    const parsed = createListingSchema.safeParse(form);
    if (!parsed.success) {
      setCreateErrors(issuesToFieldErrors(parsed.error));
      return;
    }
    setCreateErrors({});
    create.mutate();
  };

  const handleEdit = () => {
    const parsed = editListingSchema.safeParse(editForm);
    if (!parsed.success) {
      setEditErrors(issuesToFieldErrors(parsed.error));
      return;
    }
    setEditErrors({});
    update.mutate();
  };

  const handleServiceChange = (serviceId: string) => {
    const selected = services.find((s) => s.id === serviceId);
    const firstVariant = selected?.variants?.[0]?.id || "";
    setForm((prev) => ({
      ...prev,
      service_id: serviceId,
      variant: firstVariant,
    }));
  };

  const handleCreateFieldChange = (key: string, val: string) => {
    setForm((c) => ({ ...c, [key]: val }));
    setCreateErrors((c) => (c[key] ? { ...c, [key]: "" } : c));
  };

  const handleEditFieldChange = (key: string, val: string) => {
    setEditForm((c) => ({ ...c, [key]: val }));
    setEditErrors((c) => (c[key] ? { ...c, [key]: "" } : c));
  };

  const filteredListings = listings.filter((item) => {
    const state = item.public_state || item.status;
    if (activeTab === "ALL") return true;
    if (activeTab === "ACTIVE") return state === "PUBLISHED";
    if (activeTab === "REVIEW") return state === "PENDING_REVIEW" || item.moderation_status === "PENDING";
    if (activeTab === "DRAFT") return state === "DRAFT";
    if (activeTab === "CLOSED") return ["CLOSED", "EXPIRED", "REMOVED", "ARCHIVED"].includes(state);
    return state === activeTab;
  });

  return {
    home,
    listings,
    services,
    plans,
    isLoading,
    activeTab,
    setActiveTab,
    actionError,
    setActionError,
    isCreateOpen,
    setIsCreateOpen,
    editingListing,
    setEditingListing,
    isSubscriptionModalOpen,
    setIsSubscriptionModalOpen,
    form,
    editForm,
    createErrors,
    editErrors,
    createPending: create.isPending,
    createError: create.error,
    updatePending: update.isPending,
    updateError: update.error,
    actionPending: action.isPending,
    actionErrorObj: action.error,
    subscribePending: subscribe.isPending,
    subscribeError: subscribe.error,
    handleStartEdit,
    handleCreate,
    handleEdit,
    handleServiceChange,
    handleCreateFieldChange,
    handleEditFieldChange,
    runAction: action.mutate,
    runSubscribe: subscribe.mutate,
    filteredListings,
  };
}
