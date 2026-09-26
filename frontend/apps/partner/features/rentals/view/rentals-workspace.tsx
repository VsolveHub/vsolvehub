"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Card, EmptyState, Field, Input, Select, Textarea, formatMoney } from "@vsolve/ui";
import { Camera, MapPin, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";

import { usePartnerCapabilities } from "@/features/capability/queries";
import {
  bookingActionLabel,
  canSubmitAsset,
  partnerBookingAction,
  type BookingAction,
} from "@/features/rentals/booking-actions";
import {
  createPartnerRentalAsset,
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

type PhotoDraft = {
  localId: string;
  previewUrl: string;
  remoteUrl?: string;
  uploading: boolean;
  error?: string;
};

function schemaPropertyKeys(schema: Record<string, unknown> | undefined): string[] {
  const props = schema?.properties;
  if (!props || typeof props !== "object" || Array.isArray(props)) return [];
  return Object.keys(props as Record<string, unknown>);
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

export function PartnerRentalsWorkspace() {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [subcategorySlug, setSubcategorySlug] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [dailyRate, setDailyRate] = useState("");
  const [deposit, setDeposit] = useState("");
  const [location, setLocation] = useState("");
  const [photos, setPhotos] = useState<PhotoDraft[]>([]);
  const [structuredFields, setStructuredFields] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

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
    queryKey: ["partner-rentals", "bookings"],
    queryFn: fetchPartnerRentalBookings,
  });

  const subcategories: RentalTaxonomySubcategory[] = taxonomy.data ?? [];
  const selectedSub = subcategories.find((s) => s.slug === subcategorySlug);
  const selectedService = selectedSub?.services.find((s) => s.id === serviceId);
  const selectedVariant = selectedService?.variants.find((v) => v.id === variantId);
  const assetSchema = selectedVariant?.asset_schema as Record<string, unknown> | undefined;
  const schemaKeys = useMemo(() => schemaPropertyKeys(assetSchema), [assetSchema]);
  const requiredSchemaKeys = useMemo(() => schemaRequiredKeys(assetSchema), [assetSchema]);
  const backendDepositPaise = selectedVariant?.default_deposit_paise;

  useEffect(() => {
    if (backendDepositPaise == null) {
      setDeposit("");
      return;
    }
    setDeposit(paiseToRupeeInput(backendDepositPaise));
  }, [backendDepositPaise]);

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
      setDeposit("");
      setLocation("");
      setPhotos([]);
      setStructuredFields({});
      setFormError(null);
      invalidate();
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const act = useMutation({
    mutationFn: async (
      input: { kind: "submit"; id: string } | { kind: "booking"; id: string; action: BookingAction },
    ) => {
      if (input.kind === "submit") return submitPartnerRentalAsset(input.id);
      return partnerRentalBookingAction(input.id, input.action);
    },
    onSuccess: invalidate,
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
            error: err instanceof Error ? err.message : "Could not upload this photo.",
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

  function onCreate(event: FormEvent) {
    event.preventDefault();
    const dailyPaise = rupeesToPaise(dailyRate);
    const depositPaise =
      deposit.trim() === ""
        ? backendDepositPaise ?? null
        : rupeesToPaise(deposit);
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
      asset_identifier: "",
      structured_fields: fields,
      image_urls: urls,
    } as Parameters<typeof createPartnerRentalAsset>[0]);
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
            {schemaKeys.map((key) => (
              <Field key={key} label={key.replace(/_/g, " ")} required={requiredSchemaKeys.has(key)} showOptional={false}>
                <Input
                  id={`rental-field-${key}`}
                  value={structuredFields[key] ?? ""}
                  onChange={(e) =>
                    setStructuredFields((current) => ({ ...current, [key]: e.target.value }))
                  }
                />
              </Field>
            ))}
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
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
                  onChange={(e) => setDeposit(e.target.value)}
                />
              </div>
            </Field>
          </section>

          <Field label="Pickup location" required>
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
          <p className="text-sm text-danger-text">{(assets.error as Error).message}</p>
        ) : null}
        {assets.data && assets.data.length === 0 ? (
          <EmptyState compact title="No ads yet" description="Post an ad with photos to list it for review." />
        ) : null}
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {assets.data?.map((asset) => {
            const media = (asset as { media?: { url?: string }[] }).media;
            const thumb = media?.[0]?.url;
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
                    <Badge className="absolute right-2 top-2">{asset.public_state}</Badge>
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
        <h2 className="mb-3 text-base font-semibold text-navy-900">Bookings</h2>
        {bookings.isLoading ? <p className="text-sm text-text-secondary">Loading…</p> : null}
        {bookings.error ? (
          <p className="text-sm text-danger-text">{(bookings.error as Error).message}</p>
        ) : null}
        {bookings.data && bookings.data.length === 0 ? (
          <EmptyState compact title="No bookings yet" description="Bookings appear here after a customer reserves an asset." />
        ) : null}
        <ul className="flex flex-col gap-3">
          {bookings.data?.map((booking) => {
            const action = partnerBookingAction(booking.status ?? "", booking.deposit?.status);
            return (
              <li key={booking.id} className="rounded-card border border-line p-3">
                <p className="font-semibold text-navy-900">{booking.asset.title}</p>
                <p className="text-sm text-text-secondary">
                  {booking.status} · {formatMoney(booking.price_paise)} · {booking.start_date} – {booking.end_date}
                </p>
                {action ? (
                  <div className="mt-3">
                    <Button
                      size="sm"
                      disabled={act.isPending}
                      onClick={() => act.mutate({ kind: "booking", id: booking.id, action })}
                    >
                      {bookingActionLabel(action)}
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
