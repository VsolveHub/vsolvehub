"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { friendlyErrorMessage } from "@vsolve/query";
import {
  Badge,
  Button,
  Card,
  Disclosure,
  EmptyState,
  Field,
  Input,
  Select,
  Textarea,
  formatMoney,
  useT,
} from "@vsolve/ui";
import { Camera, MapPin, X } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";

import { canSubmitAsset } from "@/features/rentals/booking-actions";
import {
  createPartnerRentalAsset,
  fetchPartnerDefaultLocation,
  fetchPartnerRentalAssets,
  fetchRentalTaxonomy,
  submitPartnerRentalAsset,
  uploadPartnerRentalPhoto,
  type RentalTaxonomySubcategory,
} from "@/features/rentals/queries";
import { FindOnMap } from "@/features/location/view/find-on-map";
import { PickupHoursCard } from "@/features/rentals/view/pickup-hours-card";
import { RentalFieldInput, fieldLabel, type SchemaProperty } from "@/features/rentals/view/rental-field-input";
import { useRentalSections } from "@/features/rentals/view/rental-sections";
import { SectionNav } from "@/features/workspace/view/section-nav";

const MAX_PHOTOS = 8;

type PhotoDraft = {
  localId: string;
  previewUrl: string;
  remoteUrl?: string;
  uploading: boolean;
  error?: string;
};

/**
 * The pickup address, with its map pin when the owner placed one. The pin
 * travels with the text — prefilled from the last item, reset after posting —
 * and typing a correction keeps it, as it does on a Customer's address.
 */
type PickupAddressForm = {
  line: string;
  area: string;
  city: string;
  pincode: string;
  pin: { latitude: string; longitude: string } | null;
  /** The one-line summary from the geocoder, shown when a pin exists. */
  formattedAddress: string;
};
const EMPTY_ADDRESS: PickupAddressForm = { line: "", area: "", city: "", pincode: "", pin: null, formattedAddress: "" };
const PINCODE = /^[1-9][0-9]{5}$/;

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

/**
 * The ad side of the A7 rental workspace.
 *
 * Posting an ad and managing the ads already published. Bookings were the card
 * below this form and are now `/rentals/bookings`; the two had nothing to do
 * with each other, and the one a host visits daily was the one they had to
 * scroll past the form to reach.
 */
export function PartnerRentalsWorkspace() {
  const t = useT();
  const rentalSections = useRentalSections();
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
  const [address, setAddress] = useState<PickupAddressForm>(EMPTY_ADDRESS);
  const [defaultAddress, setDefaultAddress] = useState<PickupAddressForm>(EMPTY_ADDRESS);
  const [deliveryAvailable, setDeliveryAvailable] = useState(false);
  const [photos, setPhotos] = useState<PhotoDraft[]>([]);
  const [structuredFields, setStructuredFields] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const taxonomy = useQuery({
    queryKey: ["partner-rentals", "taxonomy"],
    queryFn: fetchRentalTaxonomy,
  });
  const assets = useQuery({
    queryKey: ["partner-rentals", "assets"],
    queryFn: fetchPartnerRentalAssets,
  });

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

  // A new item starts at the owner's last pickup address; a first item at their profile address.
  const latest = assets.data?.find((a) => a.pickup_address_line || a.pickup_city);
  useEffect(() => {
    let cancelled = false;
    if (latest) {
      const fromLatest: PickupAddressForm = {
        line: latest.pickup_address_line,
        area: latest.pickup_area,
        city: latest.pickup_city,
        pincode: latest.pickup_pincode,
        pin:
          latest.pickup_latitude && latest.pickup_longitude
            ? { latitude: latest.pickup_latitude, longitude: latest.pickup_longitude }
            : null,
        formattedAddress: [latest.pickup_area, latest.pickup_city, latest.pickup_pincode]
          .filter(Boolean)
          .join(", "),
      };
      setDefaultAddress(fromLatest);
      setAddress((current) => (current.line.trim() ? current : fromLatest));
      return;
    }
    void fetchPartnerDefaultLocation().then((loc) => {
      if (cancelled || !loc) return;
      const fromProfile = { ...EMPTY_ADDRESS, line: loc };
      setDefaultAddress(fromProfile);
      setAddress((current) => (current.line.trim() ? current : fromProfile));
    });
    return () => {
      cancelled = true;
    };
  }, [latest]);

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
      setAddress(defaultAddress);
      setDeliveryAvailable(false);
      setPhotos([]);
      setStructuredFields({});
      setFormError(null);
      invalidate();
    },
    onError: (err: unknown) => setFormError(friendlyErrorMessage(err)),
  });

  const act = useMutation({
    mutationFn: (id: string) => submitPartnerRentalAsset(id),
    onSuccess: invalidate,
  });

  function patchPhoto(localId: string, patch: Partial<PhotoDraft>) {
    setPhotos((current) => current.map((photo) => (photo.localId === localId ? { ...photo, ...patch } : photo)));
  }

  async function uploadSelectedFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    const remaining = MAX_PHOTOS - photos.length;
    if (remaining <= 0) {
      setFormError(t("rentals.ads.errorMaxPhotos", { max: MAX_PHOTOS }));
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
            error: friendlyErrorMessage(err, t("rentals.ads.errorPhotoUpload")),
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
    const quantityAvailable = Number.parseInt(quantity.trim(), 10);
    if (!variantId || !title.trim()) {
      setFormError(t("rentals.ads.errorChooseItem"));
      return;
    }
    if (!address.line.trim() || !address.city.trim()) {
      setFormError(t("rentals.ads.errorAddress"));
      return;
    }
    if (!PINCODE.test(address.pincode.trim())) {
      setFormError(t("rentals.ads.errorPincode"));
      return;
    }
    if (dailyPaise == null || dailyPaise < 1) {
      setFormError(t("rentals.ads.errorDailyRate"));
      return;
    }
    if (depositPaise == null) {
      setFormError(t("rentals.ads.errorDeposit"));
      return;
    }
    if (!Number.isFinite(quantityAvailable) || quantityAvailable < 1) {
      setFormError(t("rentals.ads.errorQuantity"));
      return;
    }
    if (photos.some((photo) => photo.uploading)) {
      setFormError(t("rentals.ads.errorPhotosUploading"));
      return;
    }
    if (photos.some((photo) => photo.error)) {
      setFormError(t("rentals.ads.errorPhotosFailed"));
      return;
    }
    const urls = photos.map((photo) => photo.remoteUrl).filter((url): url is string => Boolean(url));
    if (urls.length < 1) {
      setFormError(t("rentals.ads.errorNoPhotos"));
      return;
    }
    const fields: Record<string, string | number | boolean> = {};
    for (const key of schemaKeys) {
      const raw = structuredFields[key]?.trim() ?? "";
      if (!raw) {
        if (requiredSchemaKeys.has(key)) {
          setFormError(t("rentals.ads.errorFillField", { field: fieldLabel(key, schemaProps[key] ?? {}).toLowerCase() }));
          return;
        }
        continue;
      }
      const spec = schemaProps[key] ?? {};
      if (spec.type === "boolean") fields[key] = raw === "true";
      else if ((spec.type === "integer" || spec.type === "number") && /^\d+(\.\d+)?$/.test(raw))
        fields[key] = Number(raw);
      else fields[key] = raw;
    }
    setFormError(null);
    create.mutate({
      variant_id: variantId,
      title: title.trim(),
      description: description.trim(),
      location_text: "",
      pickup_address_line: address.line.trim(),
      pickup_area: address.area.trim(),
      pickup_city: address.city.trim(),
      pickup_pincode: address.pincode.trim(),
      ...(address.pin
        ? { pickup_latitude: address.pin.latitude, pickup_longitude: address.pin.longitude }
        : {}),
      delivery_available: deliveryAvailable,
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
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-action">{t("rentals.ads.eyebrow")}</p>
        <h1 className="mt-1 text-2xl font-extrabold text-navy-900">{t("rentals.ads.title")}</h1>
        <p className="mt-1 text-sm text-text-secondary">
          {t("rentals.ads.intro")}
        </p>
      </div>

      <SectionNav label={t("rentals.sections.ariaLabel")} items={rentalSections} />

      <PickupHoursCard />

      <Card padding="lg">
        <form className="flex flex-col gap-6" onSubmit={onCreate}>
          <section className="flex flex-col gap-3">
            <Field
              label={t("rentals.ads.photos")}
              required
              description={t("rentals.ads.photosHint", { max: MAX_PHOTOS })}
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
                        {t("rentals.ads.cover")}
                      </span>
                    ) : null}
                    {photo.uploading ? (
                      <span className="absolute inset-x-0 bottom-0 bg-navy-900/80 px-2 py-1 text-center text-[11px] font-medium text-white">
                        {t("rentals.ads.uploading")}
                      </span>
                    ) : null}
                    {photo.error ? (
                      <span className="absolute inset-x-0 bottom-0 bg-danger-text px-2 py-1 text-center text-[11px] font-medium text-white">
                        {t("rentals.ads.failed")}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      className="absolute right-1.5 top-1.5 inline-flex size-7 items-center justify-center rounded-full bg-white/95 text-navy-900 shadow-xs"
                      onClick={() => removePhoto(photo.localId)}
                      aria-label={t("rentals.ads.removePhoto")}
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
                      <span className="text-xs font-semibold">{t("rentals.ads.addPhoto")}</span>
                    </button>
                  </li>
                ) : null}
              </ul>
            </Field>
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <Field label={t("rentals.ads.type")} required>
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
                <option value="">{t("rentals.ads.selectType")}</option>
                {subcategories.map((sub) => (
                  <option key={sub.id} value={sub.slug}>
                    {sub.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("rentals.ads.whatRenting")} required>
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
                <option value="">{t("rentals.ads.selectItem")}</option>
                {selectedSub?.services.map((svc) => (
                  <option key={svc.id} value={svc.id}>
                    {svc.name}
                  </option>
                ))}
              </Select>
            </Field>
            {(selectedService?.variants.length ?? 0) > 1 ? (
              <Field label={t("rentals.ads.option")} required>
                <Select
                  id="rental-variant"
                  value={variantId}
                  onChange={(e) => {
                    setVariantId(e.target.value);
                    setStructuredFields({});
                    setDepositOverride(null);
                  }}
                >
                  <option value="">{t("rentals.ads.selectOption")}</option>
                  {selectedService?.variants.map((variant) => (
                    <option key={variant.id} value={variant.id}>
                      {variant.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
          </section>

          <section className="flex flex-col gap-3">
            <Field label={t("rentals.ads.adTitle")} required>
              <Input
                id="rental-title"
                value={title}
                maxLength={180}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("rentals.ads.adTitlePlaceholder")}
              />
            </Field>
            <Field label={t("rentals.ads.description")} showOptional={false}>
              <Textarea
                id="rental-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("rentals.ads.descriptionPlaceholder")}
              />
            </Field>
            {schemaKeys.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {schemaKeys.map((key) => (
                  // Colour, material and the like are a dropdown with "Other…" for anything else.
                  <RentalFieldInput
                    key={`${variantId}-${key}`}
                    fieldKey={key}
                    spec={schemaProps[key] ?? {}}
                    required={requiredSchemaKeys.has(key)}
                    value={structuredFields[key] ?? ""}
                    onChange={(next) => setStructuredFields((current) => ({ ...current, [key]: next }))}
                  />
                ))}
              </div>
            ) : null}
          </section>

          <section className="grid gap-3 sm:grid-cols-3">
            <Field label={t("rentals.ads.dailyRate")} required description={t("rentals.ads.dailyRateHint")}>
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
              label={t("rentals.ads.deposit")}
              required
              description={t("rentals.ads.depositHint")}
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
            <Field label={t("rentals.ads.quantity")} required description={t("rentals.ads.quantityHint")}>
              <Input
                id="rental-quantity"
                inputMode="numeric"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="1"
              />
            </Field>
          </section>

          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-bold text-navy-900">{t("rentals.ads.pickupAddress")}</h2>
                <p className="mt-0.5 text-xs text-text-secondary">
                  {t("rentals.ads.pickupAddressHint")}
                </p>
              </div>
              <FindOnMap
                title={t("rentals.ads.findPickup")}
                pin={address.pin}
                onPicked={(picked) =>
                  // Area, city and pincode follow the pin. The first line keeps
                  // what the owner typed — a shop name the map cannot know.
                  setAddress((current) => ({
                    line: current.line.trim() ? current.line : picked.line1,
                    area: picked.locality || current.area,
                    city: picked.city || current.city,
                    pincode: picked.postal_code.replace(/\D/g, "").slice(0, 6) || current.pincode,
                    pin: { latitude: picked.latitude, longitude: picked.longitude },
                    formattedAddress: picked.formatted_address || current.formattedAddress,
                  }))
                }
              />
            </div>
            {/* After a pin: show the geocoded address as a read-only summary.
                The partner only needs to type the shop/building — the rest is from Google. */}
            {address.pin && address.formattedAddress ? (
              <div className="flex items-start gap-2 rounded-control border border-success-line bg-success-surface px-3 py-2.5">
                <MapPin className="mt-0.5 size-4 shrink-0 text-success-text" aria-hidden />
                <p className="text-sm font-medium text-text">{address.formattedAddress}</p>
              </div>
            ) : null}
            <Field label={t("rentals.ads.line")} required>
              <Input
                id="rental-pickup-line"
                value={address.line}
                maxLength={240}
                onChange={(e) => setAddress((a) => ({ ...a, line: e.target.value }))}
                placeholder={t("rentals.ads.linePlaceholder")}
              />
            </Field>
            {/* Geocoded fields: collapsed behind a disclosure when a pin fills them,
                expanded when the user has not pinned yet (manual entry). */}
            {address.pin && address.city && address.pincode ? (
              <Disclosure
                summary={t("rentals.ads.editArea")}
                hint={[address.area, address.city, address.pincode].filter(Boolean).join(", ")}
              >
                <div className="grid gap-3 pt-1 sm:grid-cols-3">
                  <Field label={t("rentals.ads.area")} showOptional={false}>
                    <Input
                      id="rental-pickup-area"
                      value={address.area}
                      maxLength={120}
                      onChange={(e) => setAddress((a) => ({ ...a, area: e.target.value }))}
                      placeholder={t("rentals.ads.areaPlaceholder")}
                    />
                  </Field>
                  <Field label={t("rentals.ads.city")} required>
                    <Input
                      id="rental-pickup-city"
                      value={address.city}
                      maxLength={120}
                      onChange={(e) => setAddress((a) => ({ ...a, city: e.target.value }))}
                      placeholder={t("rentals.ads.cityPlaceholder")}
                    />
                  </Field>
                  <Field label={t("rentals.ads.pincode")} required>
                    <Input
                      id="rental-pickup-pincode"
                      inputMode="numeric"
                      maxLength={6}
                      value={address.pincode}
                      onChange={(e) => setAddress((a) => ({ ...a, pincode: e.target.value.replace(/\D/g, "") }))}
                    />
                  </Field>
                </div>
              </Disclosure>
            ) : (
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label={t("rentals.ads.area")} showOptional={false}>
                  <Input
                    id="rental-pickup-area"
                    value={address.area}
                    maxLength={120}
                    onChange={(e) => setAddress((a) => ({ ...a, area: e.target.value }))}
                    placeholder={t("rentals.ads.areaPlaceholder")}
                  />
                </Field>
                <Field label={t("rentals.ads.city")} required>
                  <Input
                    id="rental-pickup-city"
                    value={address.city}
                    maxLength={120}
                    onChange={(e) => setAddress((a) => ({ ...a, city: e.target.value }))}
                    placeholder={t("rentals.ads.cityPlaceholder")}
                  />
                </Field>
                <Field label={t("rentals.ads.pincode")} required>
                  <Input
                    id="rental-pickup-pincode"
                    inputMode="numeric"
                    maxLength={6}
                    value={address.pincode}
                    onChange={(e) => setAddress((a) => ({ ...a, pincode: e.target.value.replace(/\D/g, "") }))}
                  />
                </Field>
              </div>
            )}
          </section>

          <label className="flex items-start gap-3 rounded-control border border-line bg-surface-sunken p-3">
            <input
              id="rental-delivery-available"
              type="checkbox"
              className="mt-0.5 size-4 accent-[var(--color-action)]"
              checked={deliveryAvailable}
              onChange={(e) => setDeliveryAvailable(e.target.checked)}
            />
            <span className="text-sm">
              <span className="font-semibold text-navy-900">{t("rentals.ads.delivery")}</span>
              <span className="mt-0.5 block text-xs text-text-secondary">
                {t("rentals.ads.deliveryHint")}
              </span>
            </span>
          </label>

          {formError ? <p className="text-sm text-danger-text">{formError}</p> : null}
          <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={create.isPending || uploadingCount > 0}>
            {create.isPending ? t("rentals.ads.posting") : t("rentals.ads.post")}
          </Button>
        </form>
      </Card>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-bold text-navy-900">{t("rentals.ads.yourAds")}</h2>
          <p className="text-sm text-text-secondary">{t("rentals.ads.yourAdsHint")}</p>
        </div>
        {assets.isLoading ? <p className="text-sm text-text-secondary">{t("common.loading")}</p> : null}
        {assets.error ? (
          <p className="text-sm text-danger-text">{friendlyErrorMessage(assets.error)}</p>
        ) : null}
        {assets.data && assets.data.length === 0 ? (
          <EmptyState compact title={t("rentals.ads.emptyTitle")} description={t("rentals.ads.emptyDescription")} />
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
                        {t("rentals.ads.noPhoto")}
                      </div>
                    )}
                    <div className="absolute right-2 top-2 flex flex-col items-end gap-1">
                      <Badge>{asset.public_state}</Badge>
                      {typeof qty === "number" ? <Badge tone="neutral">{t("rentals.ads.qty", { qty })}</Badge> : null}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 p-3">
                    <p className="text-lg font-extrabold text-navy-900">{t("rentals.ads.perDay", { amount: formatMoney(asset.daily_rate_paise) })}</p>
                    <p className="font-semibold text-navy-900">{asset.title}</p>
                    {asset.location_text ? (
                      <p className="inline-flex items-center gap-1 text-sm text-text-secondary">
                        <MapPin className="size-3.5 shrink-0" />
                        {asset.location_text}
                      </p>
                    ) : null}
                    {asset.delivery_available ? <Badge tone="neutral">{t("rentals.ads.deliveryOnRequest")}</Badge> : null}
                    {asset.public_state === "DRAFT" ? (
                      <p className="text-xs text-text-secondary">
                        {t("rentals.ads.draftHint")}
                      </p>
                    ) : null}
                    {canSubmitAsset(asset.moderation_status) ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={act.isPending}
                        onClick={() => act.mutate(asset.id)}
                      >
                        {t("rentals.ads.submitForReview")}
                      </Button>
                    ) : null}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
