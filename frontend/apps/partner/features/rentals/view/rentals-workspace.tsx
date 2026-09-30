"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { friendlyErrorMessage } from "@vsolve/query";
import {
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  Field,
  Input,
  Select,
  Textarea,
  formatDate,
  formatMoney,
} from "@vsolve/ui";
import { Camera, MapPin, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";

import { usePartnerCapabilities } from "@/features/capability/queries";
import {
  bookingActionLabel,
  canCancelBooking,
  canDisputeDeposit,
  canSubmitAsset,
  partnerBookingAction,
  type BookingAction,
} from "@/features/rentals/booking-actions";
import {
  createPartnerRentalAsset,
  fetchPartnerDefaultLocation,
  fetchPartnerRentalAssets,
  fetchPartnerRentalBookings,
  fetchRentalTaxonomy,
  partnerRentalBookingAction,
  rentalVariantChoices,
  submitPartnerRentalAsset,
  uploadPartnerRentalPhoto,
  type RentalTaxonomySubcategory,
} from "@/features/rentals/queries";

const MAX_PHOTOS = 8;

const BOOKING_STATUS_FILTERS = [
  "ALL",
  "PENDING_PAYMENT",
  "CONFIRMED",
  "HANDOVER",
  "RETURNED",
  "CANCELLED",
  "DISPUTED",
] as const;

type BookingStatusFilter = (typeof BOOKING_STATUS_FILTERS)[number];

const BOOKING_STATUS_LABELS: Record<BookingStatusFilter, string> = {
  ALL: "All",
  PENDING_PAYMENT: "Pending payment",
  CONFIRMED: "Confirmed",
  HANDOVER: "Handover",
  RETURNED: "Returned",
  CANCELLED: "Cancelled",
  DISPUTED: "Disputed",
};

type PhotoDraft = {
  localId: string;
  previewUrl: string;
  remoteUrl?: string;
  uploading: boolean;
  error?: string;
};

type BookingActionBody = { pin?: string; reason?: string; consume_paise: number };

type SchemaProperty = {
  type?: string;
  enum?: unknown[];
};

type HandoverModal = { bookingId: string; pin: string; error: string | null };
type DisputeModal = {
  bookingId: string;
  reason: string;
  consumeRupees: string;
  error: string | null;
};
type CancelModal = { bookingId: string; reason: string; error: string | null };

function schemaPropertyMap(
  schema: Record<string, unknown> | undefined,
): Record<string, SchemaProperty> {
  const props = schema?.properties;
  if (!props || typeof props !== "object" || Array.isArray(props)) return {};
  return props as Record<string, SchemaProperty>;
}

function schemaPropertyKeys(schema: Record<string, unknown> | undefined): string[] {
  return Object.keys(schemaPropertyMap(schema));
}

function schemaRequiredKeys(schema: Record<string, unknown> | undefined): Set<string> {
  const required = schema?.required;
  if (!Array.isArray(required)) return new Set();
  return new Set(required.filter((key): key is string => typeof key === "string"));
}

function rupeesToPaise(input: string): number | null {
  const trimmed = input.trim().replace(/,/g, "").replace(/^₹\s*/u, "");
  if (!trimmed) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const rupees = Number(trimmed);
  if (!Number.isFinite(rupees) || rupees < 0) return null;
  return Math.round(rupees * 100);
}

function paiseToRupeeInput(paise: number): string {
  return (paise / 100).toString();
}

function newLocalId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function statusFilterLabel(status: BookingStatusFilter): string {
  return BOOKING_STATUS_LABELS[status];
}

function bookingBadgeTone(
  status: string,
): "success" | "warning" | "neutral" | "danger" {
  const value = status.toUpperCase();
  if (value === "CANCELLED" || value === "DISPUTED") return "danger";
  if (value === "PENDING_PAYMENT") return "warning";
  if (value === "CONFIRMED" || value === "HANDOVER") return "success";
  return "neutral";
}

export function PartnerRentalsWorkspace() {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [subcategorySlug, setSubcategorySlug] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [dailyRate, setDailyRate] = useState("");
  const [depositOverride, setDepositOverride] = useState<string | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [location, setLocation] = useState("");
  const [defaultLocation, setDefaultLocation] = useState("");
  const [photos, setPhotos] = useState<PhotoDraft[]>([]);
  const [structuredFields, setStructuredFields] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const queryStatus = searchParams?.get("status") ?? "";
  const bookingStatusFilter = BOOKING_STATUS_FILTERS.includes(queryStatus as BookingStatusFilter)
    ? (queryStatus as BookingStatusFilter)
    : "ALL";

  function setBookingStatusFilter(status: BookingStatusFilter) {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (status === "ALL") {
      params.delete("status");
    } else {
      params.set("status", status);
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const [handoverModal, setHandoverModal] = useState<HandoverModal | null>(null);
  const [disputeModal, setDisputeModal] = useState<DisputeModal | null>(null);
  const [cancelModal, setCancelModal] = useState<CancelModal | null>(null);

  const capabilities = usePartnerCapabilities();
  const capabilityVariants = rentalVariantChoices(capabilities.data?.capabilities);
  const taxonomy = useQuery({
    queryKey: ["partner-rentals", "taxonomy"],
    queryFn: fetchRentalTaxonomy,
  });
  const assets = useQuery({
    queryKey: ["partner-rentals", "assets"],
    queryFn: fetchPartnerRentalAssets,
  });
  const bookings = useQuery({
    queryKey: ["partner-rentals", "bookings", bookingStatusFilter],
    queryFn: () =>
      fetchPartnerRentalBookings(bookingStatusFilter === "ALL" ? undefined : bookingStatusFilter),
  });

  // Defensive client filter in case the API ignores `?status=` (stays enquiry pattern).
  const filteredBookings = useMemo(() => {
    const rows = bookings.data ?? [];
    if (bookingStatusFilter === "ALL") return rows;
    return rows.filter((booking) => (booking.status ?? "").toUpperCase() === bookingStatusFilter);
  }, [bookings.data, bookingStatusFilter]);

  const subcategories: RentalTaxonomySubcategory[] = taxonomy.data ?? [];
  const selectedSub = subcategories.find((s) => s.slug === subcategorySlug);
  const selectedService = selectedSub?.services.find((s) => s.id === serviceId);
  const selectedVariant = selectedService?.variants.find((v) => v.id === variantId);
  const assetSchema = selectedVariant?.asset_schema as Record<string, unknown> | undefined;
  const schemaProps = schemaPropertyMap(assetSchema);
  const schemaKeys = schemaPropertyKeys(assetSchema);
  const requiredSchemaKeys = schemaRequiredKeys(assetSchema);
  const backendDepositPaise = selectedVariant?.default_deposit_paise;
  const deposit =
    depositOverride ??
    (backendDepositPaise == null ? "" : paiseToRupeeInput(backendDepositPaise));

  useEffect(() => {
    let cancelled = false;
    void fetchPartnerDefaultLocation().then((loc) => {
      if (cancelled) return;
      setDefaultLocation(loc);
      setLocation((current) => (current.trim() ? current : loc));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      photos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
    };
    // Only revoke leftover object URLs when the workspace unmounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["partner-rentals"] });
  };

  const create = useMutation({
    mutationFn: createPartnerRentalAsset,
    onSuccess: () => {
      photos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
      setTitle("");
      setDescription("");
      setSubcategorySlug("");
      setServiceId("");
      setVariantId("");
      setDailyRate("");
      setDepositOverride(null);
      setQuantity("1");
      setLocation(defaultLocation);
      setPhotos([]);
      setStructuredFields({});
      setFormError(null);
      invalidate();
    },
    onError: (err: unknown) => setFormError(friendlyErrorMessage(err)),
  });

  const act = useMutation({
    mutationFn: async (
      input:
        | { kind: "submit"; id: string }
        | { kind: "booking"; id: string; action: BookingAction; body?: BookingActionBody },
    ) => {
      if (input.kind === "submit") return submitPartnerRentalAsset(input.id);
      return partnerRentalBookingAction(input.id, input.action, input.body);
    },
    onSuccess: () => {
      setHandoverModal(null);
      setDisputeModal(null);
      setCancelModal(null);
      invalidate();
    },
    onError: (err: unknown) => {
      const message = friendlyErrorMessage(err);
      setHandoverModal((current) => (current ? { ...current, error: message } : current));
      setDisputeModal((current) => (current ? { ...current, error: message } : current));
      setCancelModal((current) => (current ? { ...current, error: message } : current));
    },
  });

  function patchPhoto(localId: string, patch: Partial<PhotoDraft>) {
    setPhotos((current) => current.map((photo) => (photo.localId === localId ? { ...photo, ...patch } : photo)));
  }

  async function uploadSelectedFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    const remaining = MAX_PHOTOS - photos.length;
    if (remaining <= 0) {
      setFormError(`You can add up to ${MAX_PHOTOS} photos.`);
      return;
    }
    const chosen = Array.from(fileList).slice(0, remaining);
    const drafts: PhotoDraft[] = chosen.map((file) => ({
      localId: newLocalId(),
      previewUrl: URL.createObjectURL(file),
      uploading: true,
    }));
    setPhotos((current) => [...current, ...drafts]);
    setFormError(null);
    await Promise.all(
      drafts.map(async (draft, index) => {
        const file = chosen[index];
        if (!file) return;
        try {
          const uploaded = await uploadPartnerRentalPhoto(file);
          patchPhoto(draft.localId, { remoteUrl: uploaded.url, uploading: false, error: undefined });
        } catch (err) {
          patchPhoto(draft.localId, {
            uploading: false,
            error: friendlyErrorMessage(err, "Could not upload this photo."),
          });
        }
      }),
    );
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removePhoto(localId: string) {
    setPhotos((current) => {
      const match = current.find((photo) => photo.localId === localId);
      if (match) URL.revokeObjectURL(match.previewUrl);
      return current.filter((photo) => photo.localId !== localId);
    });
  }

  function runBookingAction(bookingId: string, action: BookingAction) {
    if (action === "handover") {
      setHandoverModal({ bookingId, pin: "", error: null });
      return;
    }
    if (action === "dispute-deposit") {
      setDisputeModal({ bookingId, reason: "", consumeRupees: "", error: null });
      return;
    }
    if (action === "cancel") {
      setCancelModal({ bookingId, reason: "", error: null });
      return;
    }
    act.mutate({ kind: "booking", id: bookingId, action, body: { consume_paise: 0 } });
  }

  function confirmCancel() {
    if (!cancelModal) return;
    act.mutate({
      kind: "booking",
      id: cancelModal.bookingId,
      action: "cancel",
      body: { reason: cancelModal.reason.trim(), consume_paise: 0 },
    });
  }

  function confirmHandover() {
    if (!handoverModal) return;
    const pin = handoverModal.pin.trim();
    if (!/^\d{4}$/.test(pin)) {
      setHandoverModal({ ...handoverModal, error: "Enter the 4-digit handover PIN from the customer." });
      return;
    }
    act.mutate({
      kind: "booking",
      id: handoverModal.bookingId,
      action: "handover",
      body: { pin, consume_paise: 0 },
    });
  }

  function confirmDispute() {
    if (!disputeModal) return;
    const reason = disputeModal.reason.trim();
    if (!reason) {
      setDisputeModal({ ...disputeModal, error: "Add a reason for the deposit dispute." });
      return;
    }
    // Blank consume = 0 (none). Always send consume_paise so the server never
    // treats a missing field as full deposit consume.
    let consumePaise = 0;
    if (disputeModal.consumeRupees.trim()) {
      const parsed = rupeesToPaise(disputeModal.consumeRupees);
      if (parsed == null || parsed < 0) {
        setDisputeModal({
          ...disputeModal,
          error: "Enter a valid consume amount in rupees, or leave blank for none.",
        });
        return;
      }
      consumePaise = parsed;
    }
    act.mutate({
      kind: "booking",
      id: disputeModal.bookingId,
      action: "dispute-deposit",
      body: { reason, consume_paise: consumePaise },
    });
  }

  function onCreate(event: FormEvent) {
    event.preventDefault();
    const dailyPaise = rupeesToPaise(dailyRate);
    const depositPaise =
      deposit.trim() === ""
        ? backendDepositPaise ?? null
        : rupeesToPaise(deposit);
    const quantityAvailable = Number.parseInt(quantity.trim(), 10);
    if (!variantId || !title.trim()) {
      setFormError("Choose a category, service, variant, and a title.");
      return;
    }
    if (!location.trim()) {
      setFormError("Add the pickup location for this ad.");
      return;
    }
    if (dailyPaise == null || dailyPaise < 1) {
      setFormError("Enter a daily rate in rupees, for example 250 or 249.50.");
      return;
    }
    if (depositPaise == null) {
      setFormError("Choose a variant so the refundable deposit can load from its category policy.");
      return;
    }
    if (!Number.isFinite(quantityAvailable) || quantityAvailable < 1) {
      setFormError("Quantity must be at least 1.");
      return;
    }
    if (photos.some((photo) => photo.uploading)) {
      setFormError("Wait for every photo to finish uploading.");
      return;
    }
    if (photos.some((photo) => photo.error)) {
      setFormError("Remove failed photos or try uploading them again.");
      return;
    }
    const urls = photos.map((photo) => photo.remoteUrl).filter((url): url is string => Boolean(url));
    if (urls.length < 1) {
      setFormError("Add at least one photo. Customers see the first photo as the cover.");
      return;
    }
    const fields: Record<string, string | number | boolean> = {};
    for (const key of schemaKeys) {
      const raw = structuredFields[key]?.trim() ?? "";
      if (!raw) {
        if (requiredSchemaKeys.has(key)) {
          setFormError(`Fill in ${key.replace(/_/g, " ")}.`);
          return;
        }
        continue;
      }
      if (raw === "true" || raw === "false") fields[key] = raw === "true";
      else if (/^\d+$/.test(raw)) fields[key] = Number(raw);
      else fields[key] = raw;
    }
    setFormError(null);
    create.mutate({
      variant_id: variantId,
      title: title.trim(),
      description: description.trim(),
      location_text: location.trim(),
      daily_rate_paise: dailyPaise,
      deposit_paise: depositPaise,
      quantity_available: quantityAvailable,
      asset_identifier: "",
      structured_fields: fields,
      image_urls: urls,
    });
  }

  const uploadingCount = photos.filter((photo) => photo.uploading).length;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-action">Rental ads</p>
        <h1 className="mt-1 text-2xl font-extrabold text-navy-900">Post your rental</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Add real photos, a price, and a pickup location. The first photo becomes the cover.
        </p>
      </div>

      <Card padding="lg">
        <form className="flex flex-col gap-6" onSubmit={onCreate}>
          <section className="flex flex-col gap-3">
            <Field
              label="Photos"
              required
              description={`First photo is the cover. JPEG, PNG or WebP, up to ${MAX_PHOTOS} photos.`}
            >
              <input
                ref={fileInputRef}
                id="rental-photos"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="sr-only"
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  void uploadSelectedFiles(event.target.files);
                }}
              />
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {photos.map((photo, index) => (
                  <li
                    key={photo.localId}
                    className="relative aspect-square overflow-hidden rounded-card border border-line bg-surface-sunken"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.previewUrl} alt="" className="size-full object-cover" />
                    {index === 0 ? (
                      <span className="absolute left-1.5 top-1.5 rounded-control bg-navy-900 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                        Cover
                      </span>
                    ) : null}
                    {photo.uploading ? (
                      <span className="absolute inset-x-0 bottom-0 bg-navy-900/80 px-2 py-1 text-center text-[11px] font-medium text-white">
                        Uploading…
                      </span>
                    ) : null}
                    {photo.error ? (
                      <span className="absolute inset-x-0 bottom-0 bg-danger-text px-2 py-1 text-center text-[11px] font-medium text-white">
                        Failed
                      </span>
                    ) : null}
                    <button
                      type="button"
                      className="absolute right-1.5 top-1.5 inline-flex size-7 items-center justify-center rounded-full bg-white/95 text-navy-900 shadow-xs"
                      onClick={() => removePhoto(photo.localId)}
                      aria-label="Remove photo"
                    >
                      <X className="size-3.5" />
                    </button>
                  </li>
                ))}
                {photos.length < MAX_PHOTOS ? (
                  <li>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-line-strong bg-surface-sunken text-text-secondary transition hover:border-action hover:bg-surface hover:text-navy-900"
                    >
                      <Camera className="size-7" />
                      <span className="text-xs font-semibold">Add photo</span>
                    </button>
                  </li>
                ) : null}
              </ul>
            </Field>
          </section>

          <section className="grid gap-3 sm:grid-cols-3">
            <Field label="Category" required>
              <Select
                id="rental-subcategory"
                value={subcategorySlug}
                onChange={(e) => {
                  setSubcategorySlug(e.target.value);
                  setServiceId("");
                  setVariantId("");
                  setStructuredFields({});
                  setDepositOverride(null);
                }}
              >
                <option value="">Select category</option>
                {subcategories.map((sub) => (
                  <option key={sub.id} value={sub.slug}>
                    {sub.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Service" required>
              <Select
                id="rental-service"
                value={serviceId}
                disabled={!selectedSub}
                onChange={(e) => {
                  setServiceId(e.target.value);
                  setVariantId("");
                  setStructuredFields({});
                  setDepositOverride(null);
                  const svc = selectedSub?.services.find((s) => s.id === e.target.value);
                  const first = svc?.variants[0];
                  if (first) {
                    setVariantId(first.id);
                  }
                }}
              >
                <option value="">Select service</option>
                {selectedSub?.services.map((svc) => (
                  <option key={svc.id} value={svc.id}>
                    {svc.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Variant" required>
              <Select
                id="rental-variant"
                value={variantId}
                onChange={(e) => {
                  setVariantId(e.target.value);
                  setStructuredFields({});
                  setDepositOverride(null);
                }}
              >
                <option value="">Select a variant</option>
                {(selectedService?.variants.length
                  ? selectedService.variants.map((v) => ({ id: v.id, name: v.name }))
                  : capabilityVariants
                ).map((variant) => (
                  <option key={variant.id} value={variant.id}>
                    {variant.name}
                  </option>
                ))}
              </Select>
            </Field>
          </section>

          <section className="flex flex-col gap-3">
            <Field label="Ad title" required>
              <Input
                id="rental-title"
                value={title}
                maxLength={180}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Bosch hammer drill, lightly used"
              />
            </Field>
            <Field label="Description" showOptional={false}>
              <Textarea
                id="rental-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Condition, what is included, and pickup notes."
              />
            </Field>
            {schemaKeys.map((key) => {
              const spec = schemaProps[key] ?? {};
              const enums = Array.isArray(spec.enum) ? spec.enum.map(String) : null;
              const required = requiredSchemaKeys.has(key);
              const label = key.replace(/_/g, " ");
              if (enums || spec.type === "boolean") {
                const options = enums ?? ["true", "false"];
                return (
                  <Field key={key} label={label} required={required} showOptional={false}>
                    <Select
                      id={`rental-field-${key}`}
                      value={structuredFields[key] ?? ""}
                      onChange={(e) =>
                        setStructuredFields((current) => ({ ...current, [key]: e.target.value }))
                      }
                    >
                      <option value="">Select {label}</option>
                      {options.map((option) => (
                        <option key={option} value={option}>
                          {spec.type === "boolean" ? (option === "true" ? "Yes" : "No") : option}
                        </option>
                      ))}
                    </Select>
                  </Field>
                );
              }
              return (
                <Field key={key} label={label} required={required} showOptional={false}>
                  <Input
                    id={`rental-field-${key}`}
                    inputMode={spec.type === "number" ? "numeric" : "text"}
                    value={structuredFields[key] ?? ""}
                    onChange={(e) =>
                      setStructuredFields((current) => ({ ...current, [key]: e.target.value }))
                    }
                  />
                </Field>
              );
            })}
          </section>

          <section className="grid gap-3 sm:grid-cols-3">
            <Field label="Daily rate" required description="Amount in rupees. Customers see this per day.">
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm font-semibold text-text-secondary">
                  ₹
                </span>
                <Input
                  id="rental-rate"
                  className="pl-8"
                  inputMode="decimal"
                  value={dailyRate}
                  onChange={(e) => setDailyRate(e.target.value)}
                  placeholder="250"
                />
              </div>
            </Field>
            <Field
              label="Refundable deposit"
              required
              description="Suggested from this variant's category policy. Change it only if this asset needs a different hold."
            >
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm font-semibold text-text-secondary">
                  ₹
                </span>
                <Input
                  id="rental-deposit"
                  className="pl-8"
                  inputMode="decimal"
                  value={deposit}
                  onChange={(e) => setDepositOverride(e.target.value)}
                />
              </div>
            </Field>
            <Field label="Quantity available" required description="How many identical units you can rent out.">
              <Input
                id="rental-quantity"
                inputMode="numeric"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="1"
              />
            </Field>
          </section>

          <Field
            label="Pickup location"
            required
            description={
              defaultLocation
                ? "Prefills from your profile default address. Edit if this pickup differs."
                : "Customers collect from this address."
            }
          >
            <Input
              id="rental-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Area, city — customers collect from here"
            />
          </Field>

          {formError ? <p className="text-sm text-danger-text">{formError}</p> : null}
          <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={create.isPending || uploadingCount > 0}>
            {create.isPending ? "Posting ad…" : "Post ad"}
          </Button>
        </form>
      </Card>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-bold text-navy-900">Your ads</h2>
          <p className="text-sm text-text-secondary">Submit a draft when the photos and price look right.</p>
        </div>
        {assets.isLoading ? <p className="text-sm text-text-secondary">Loading…</p> : null}
        {assets.error ? (
          <p className="text-sm text-danger-text">{friendlyErrorMessage(assets.error)}</p>
        ) : null}
        {assets.data && assets.data.length === 0 ? (
          <EmptyState compact title="No ads yet" description="Post an ad with photos to list it for review." />
        ) : null}
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {assets.data?.map((asset) => {
            const thumb = asset.media?.[0]?.url;
            const qty = asset.quantity_available;
            return (
              <li key={asset.id}>
                <Card padding="none" className="overflow-hidden">
                  <div className="relative aspect-[4/3] bg-surface-sunken">
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt="" className="size-full object-cover" />
                    ) : (
                      <div className="flex size-full items-center justify-center text-sm text-text-muted">
                        No photo
                      </div>
                    )}
                    <div className="absolute right-2 top-2 flex flex-col items-end gap-1">
                      <Badge>{asset.public_state}</Badge>
                      {typeof qty === "number" ? <Badge tone="neutral">Qty {qty}</Badge> : null}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 p-3">
                    <p className="text-lg font-extrabold text-navy-900">{formatMoney(asset.daily_rate_paise)} / day</p>
                    <p className="font-semibold text-navy-900">{asset.title}</p>
                    {asset.location_text ? (
                      <p className="inline-flex items-center gap-1 text-sm text-text-secondary">
                        <MapPin className="size-3.5 shrink-0" />
                        {asset.location_text}
                      </p>
                    ) : null}
                    {canSubmitAsset(asset.moderation_status) ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={act.isPending}
                        onClick={() => act.mutate({ kind: "submit", id: asset.id })}
                      >
                        Submit for review
                      </Button>
                    ) : null}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      </section>

      <Card>
        <div className="mb-3 flex flex-col gap-3">
          <h2 className="text-base font-semibold text-navy-900">Bookings</h2>
          <div className="flex flex-wrap gap-2">
            {BOOKING_STATUS_FILTERS.map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setBookingStatusFilter(status)}
                className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                  bookingStatusFilter === status
                    ? "bg-action text-white"
                    : "border border-line bg-surface text-text-secondary hover:text-navy-900"
                }`}
              >
                {statusFilterLabel(status)}
              </button>
            ))}
          </div>
        </div>
        {bookings.isLoading ? <p className="text-sm text-text-secondary">Loading…</p> : null}
        {bookings.error ? (
          <p className="text-sm text-danger-text">{friendlyErrorMessage(bookings.error)}</p>
        ) : null}
        {act.isError && !handoverModal && !disputeModal && !cancelModal ? (
          <p className="mb-3 text-sm text-danger-text">{friendlyErrorMessage(act.error)}</p>
        ) : null}
        {!bookings.isLoading && !bookings.error && filteredBookings.length === 0 ? (
          <EmptyState
            compact
            title={
              bookingStatusFilter === "ALL"
                ? "No bookings yet"
                : `No ${statusFilterLabel(bookingStatusFilter).toLowerCase()} bookings`
            }
            description={
              bookingStatusFilter === "ALL"
                ? "Bookings appear here after a customer reserves an asset."
                : "Try another status filter to see more."
            }
          />
        ) : null}
        <ul className="flex flex-col gap-3">
          {filteredBookings.map((booking) => {
            const action = partnerBookingAction(booking.status ?? "", booking.deposit?.status);
            const showDispute = canDisputeDeposit(booking.status ?? "", booking.deposit?.status);
            const showCancel = canCancelBooking(booking.status ?? "");
            const statusValue = (booking.status ?? "").toUpperCase();
            return (
              <li key={booking.id} className="rounded-card border border-line p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-navy-900">{booking.asset.title}</p>
                  <Badge tone={bookingBadgeTone(statusValue)}>
                    {BOOKING_STATUS_LABELS[statusValue as BookingStatusFilter] ?? booking.status}
                  </Badge>
                </div>
                <p className="text-sm text-text-secondary">
                  {formatMoney(booking.price_paise)} · {formatDate(booking.start_date)} –{" "}
                  {formatDate(booking.end_date)}
                </p>
                {action || showDispute || showCancel ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {action ? (
                      <Button
                        size="sm"
                        disabled={act.isPending}
                        onClick={() => runBookingAction(booking.id, action)}
                      >
                        {bookingActionLabel(action)}
                      </Button>
                    ) : null}
                    {showDispute ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={act.isPending}
                        onClick={() => runBookingAction(booking.id, "dispute-deposit")}
                      >
                        {bookingActionLabel("dispute-deposit")}
                      </Button>
                    ) : null}
                    {showCancel ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={act.isPending}
                        onClick={() => runBookingAction(booking.id, "cancel")}
                      >
                        {bookingActionLabel("cancel")}
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Card>

      <Dialog
        open={Boolean(handoverModal)}
        onOpenChange={(open) => {
          if (!open && !act.isPending) setHandoverModal(null);
        }}
        title="Confirm handover"
        description="Ask the customer for their 4-digit handover PIN, then enter it here."
        footer={
          <>
            <Button
              variant="ghost"
              disabled={act.isPending}
              onClick={() => setHandoverModal(null)}
            >
              Cancel
            </Button>
            <Button loading={act.isPending} loadingLabel="Confirming…" onClick={confirmHandover}>
              Confirm handover
            </Button>
          </>
        }
      >
        <Field
          label="Handover PIN"
          required
          error={handoverModal?.error ?? undefined}
        >
          <Input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={4}
            value={handoverModal?.pin ?? ""}
            onChange={(e) =>
              setHandoverModal((current) =>
                current ? { ...current, pin: e.target.value.replace(/\D/g, "").slice(0, 4), error: null } : current,
              )
            }
            placeholder="4-digit PIN"
          />
        </Field>
      </Dialog>

      <Dialog
        open={Boolean(disputeModal)}
        onOpenChange={(open) => {
          if (!open && !act.isPending) setDisputeModal(null);
        }}
        title="Raise deposit dispute"
        description="Explain the issue. Leave consume blank (or 0) to dispute without taking money from the deposit."
        footer={
          <>
            <Button
              variant="ghost"
              disabled={act.isPending}
              onClick={() => setDisputeModal(null)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={act.isPending}
              loadingLabel="Submitting…"
              onClick={confirmDispute}
            >
              Raise dispute
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Field label="Reason" required error={disputeModal?.error ?? undefined}>
            <Textarea
              value={disputeModal?.reason ?? ""}
              onChange={(e) =>
                setDisputeModal((current) =>
                  current ? { ...current, reason: e.target.value, error: null } : current,
                )
              }
              placeholder="e.g. Scratched housing, missing bit set"
              rows={3}
            />
          </Field>
          <Field
            label="Amount to consume from deposit"
            description="Rupees. Leave blank for none (0). Blank never means full deposit."
            showOptional={false}
          >
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm font-semibold text-text-secondary">
                ₹
              </span>
              <Input
                className="pl-8"
                inputMode="decimal"
                value={disputeModal?.consumeRupees ?? ""}
                onChange={(e) =>
                  setDisputeModal((current) =>
                    current ? { ...current, consumeRupees: e.target.value, error: null } : current,
                  )
                }
                placeholder="0"
              />
            </div>
          </Field>
        </div>
      </Dialog>

      <Dialog
        open={Boolean(cancelModal)}
        onOpenChange={(open) => {
          if (!open && !act.isPending) setCancelModal(null);
        }}
        title="Cancel booking"
        description="Cancels before handover. The customer gets a full refund and the asset dates are freed."
        footer={
          <>
            <Button
              variant="ghost"
              disabled={act.isPending}
              onClick={() => setCancelModal(null)}
            >
              Keep booking
            </Button>
            <Button
              variant="danger"
              loading={act.isPending}
              loadingLabel="Cancelling…"
              onClick={confirmCancel}
            >
              Cancel booking
            </Button>
          </>
        }
      >
        <Field label="Reason" showOptional error={cancelModal?.error ?? undefined}>
          <Textarea
            value={cancelModal?.reason ?? ""}
            onChange={(e) =>
              setCancelModal((current) =>
                current ? { ...current, reason: e.target.value, error: null } : current,
              )
            }
            placeholder="e.g. Equipment unavailable"
            rows={3}
          />
        </Field>
      </Dialog>
    </div>
  );
}
