"use client";

import { useMutation } from "@tanstack/react-query";
import { friendlyErrorMessage } from "@vsolve/query";
import { Button, Field, Input, Select, Sheet, Textarea, useToast } from "@vsolve/ui";
import { Camera, X } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";

import {
  createPartnerRentalAsset,
  deletePartnerRentalAssetMedia,
  partnerRentalAssetAction,
  updatePartnerRentalAsset,
  uploadPartnerRentalPhoto,
  type RentalAsset,
  type RentalTaxonomySubcategory,
  type RentalTaxonomyVariant,
} from "@/features/rentals/queries";
import {
  RentalFieldInput,
  fieldLabel,
  type SchemaProperty,
} from "@/features/rentals/view/rental-field-input";

const MAX_PHOTOS = 8;
const FORM_ID = "rental-ad-form";

type Photo = {
  localId: string;
  previewUrl: string;
  /** Set for a photo already on the ad. */
  mediaId?: string;
  /** Set once a new photo has uploaded. */
  remoteUrl?: string;
  uploading: boolean;
  error?: string;
  isObjectUrl: boolean;
};

function schemaProps(schema: Record<string, unknown> | undefined): Record<string, SchemaProperty> {
  const props = schema?.properties;
  if (!props || typeof props !== "object" || Array.isArray(props)) return {};
  return props as Record<string, SchemaProperty>;
}

function schemaRequired(schema: Record<string, unknown> | undefined): Set<string> {
  const required = schema?.required;
  if (!Array.isArray(required)) return new Set();
  return new Set(required.filter((key): key is string => typeof key === "string"));
}

function rupeesToPaise(input: string): number | null {
  const trimmed = input.trim().replace(/,/g, "").replace(/^₹\s*/u, "");
  if (!trimmed || !/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const rupees = Number(trimmed);
  return Number.isFinite(rupees) && rupees >= 0 ? Math.round(rupees * 100) : null;
}

function paiseToRupees(paise: number): string {
  return (paise / 100).toString();
}

function newLocalId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function fieldsToStrings(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (value === null || value === undefined) continue;
    out[key] = String(value);
  }
  return out;
}

type VariantPath = {
  sub: RentalTaxonomySubcategory;
  serviceName: string;
  variant: RentalTaxonomyVariant;
};

function findVariant(taxonomy: RentalTaxonomySubcategory[], variantId: string): VariantPath | null {
  for (const sub of taxonomy) {
    for (const service of sub.services) {
      const variant = service.variants.find((v) => v.id === variantId);
      if (variant) return { sub, serviceName: service.name, variant };
    }
  }
  return null;
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-b border-line/70 py-5 last:border-b-0">
      <div>
        <h3 className="text-sm font-bold text-navy-900">{title}</h3>
        {hint ? <p className="mt-0.5 text-xs text-text-secondary">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

/**
 * Add a new rental item, or edit one already posted.
 *
 * Opens in a side sheet so the list of items stays the page. A new item is
 * sent for review straight away; the partner never has to find a second
 * "Submit" button. Editing keeps the item's current status.
 */
export function RentalAdEditor({
  asset,
  taxonomy,
  defaultLocation,
  onClose,
  onSaved,
}: {
  /** null = a new item. */
  asset: RentalAsset | null;
  taxonomy: RentalTaxonomySubcategory[];
  defaultLocation: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { notify } = useToast();
  const isEdit = asset !== null;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const existingPath = asset ? findVariant(taxonomy, asset.variant) : null;

  const [subcategorySlug, setSubcategorySlug] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [variantId, setVariantId] = useState(asset?.variant ?? "");
  const [title, setTitle] = useState(asset?.title ?? "");
  const [description, setDescription] = useState(asset?.description ?? "");
  const [dailyRate, setDailyRate] = useState(asset ? paiseToRupees(asset.daily_rate_paise) : "");
  const [depositOverride, setDepositOverride] = useState<string | null>(
    asset ? paiseToRupees(asset.deposit_paise) : null,
  );
  const [quantity, setQuantity] = useState(String(asset?.quantity_available ?? 1));
  const [addressLine, setAddressLine] = useState(
    asset?.pickup_address_line || asset?.location_text || defaultLocation,
  );
  const [area, setArea] = useState(asset?.pickup_area ?? "");
  const [city, setCity] = useState(asset?.pickup_city ?? "");
  const [pincode, setPincode] = useState(asset?.pickup_pincode ?? "");
  const [deliveryAvailable, setDeliveryAvailable] = useState(asset?.delivery_available ?? false);
  const [fields, setFields] = useState<Record<string, string>>(() =>
    fieldsToStrings(asset?.structured_fields),
  );
  const [photos, setPhotos] = useState<Photo[]>(() =>
    (asset?.media ?? []).map((m) => ({
      localId: m.id,
      previewUrl: m.image_url || m.url,
      mediaId: m.id,
      uploading: false,
      isObjectUrl: false,
    })),
  );
  const [removedMediaIds, setRemovedMediaIds] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  const selectedSub = taxonomy.find((s) => s.slug === subcategorySlug);
  const selectedService = selectedSub?.services.find((s) => s.id === serviceId);
  const variant: RentalTaxonomyVariant | undefined = isEdit
    ? existingPath?.variant
    : selectedService?.variants.find((v) => v.id === variantId);
  const schema = variant?.asset_schema as Record<string, unknown> | undefined;
  const props = schemaProps(schema);
  const fieldKeys = Object.keys(props);
  const requiredKeys = schemaRequired(schema);
  const suggestedDeposit = variant?.default_deposit_paise;
  const deposit = depositOverride ?? (suggestedDeposit == null ? "" : paiseToRupees(suggestedDeposit));

  useEffect(() => {
    // A new item opened before the profile address loaded still gets it.
    if (!isEdit && defaultLocation) {
      setAddressLine((current) => (current.trim() ? current : defaultLocation));
    }
  }, [defaultLocation, isEdit]);

  const photosRef = useRef(photos);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);
  useEffect(
    () => () => {
      photosRef.current.forEach((p) => {
        if (p.isObjectUrl) URL.revokeObjectURL(p.previewUrl);
      });
    },
    [],
  );

  function patchPhoto(localId: string, patch: Partial<Photo>) {
    setPhotos((current) => current.map((p) => (p.localId === localId ? { ...p, ...patch } : p)));
  }

  async function addFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) {
      setFormError(`You can add up to ${MAX_PHOTOS} photos.`);
      return;
    }
    const chosen = Array.from(fileList).slice(0, room);
    const drafts: Photo[] = chosen.map((file) => ({
      localId: newLocalId(),
      previewUrl: URL.createObjectURL(file),
      uploading: true,
      isObjectUrl: true,
    }));
    setPhotos((current) => [...current, ...drafts]);
    setFormError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
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
  }

  function removePhoto(photo: Photo) {
    if (photo.isObjectUrl) URL.revokeObjectURL(photo.previewUrl);
    if (photo.mediaId) setRemovedMediaIds((ids) => [...ids, photo.mediaId as string]);
    setPhotos((current) => current.filter((p) => p.localId !== photo.localId));
  }

  type Payload = {
    title: string;
    description: string;
    addressLine: string;
    area: string;
    city: string;
    pincode: string;
    deliveryAvailable: boolean;
    daily_rate_paise: number;
    deposit_paise: number;
    quantity_available: number;
    structured_fields: Record<string, string | number | boolean>;
    newUrls: string[];
  };

  const save = useMutation({
    mutationFn: async (payload: Payload): Promise<"created" | "draft" | "updated"> => {
      const { newUrls, addressLine, area, city, pincode, deliveryAvailable, ...rest } = payload;
      const locationText = [area, city].filter(Boolean).join(", ") || addressLine;

      if (asset) {
        for (const mediaId of removedMediaIds) {
          await deletePartnerRentalAssetMedia(asset.id, mediaId);
        }
        await updatePartnerRentalAsset(asset.id, {
          ...rest,
          location_text: locationText,
          pickup_address_line: addressLine,
          pickup_area: area,
          pickup_city: city,
          pickup_pincode: pincode,
          delivery_available: deliveryAvailable,
        });
        return "updated";
      }
      const created = await createPartnerRentalAsset({
        ...rest,
        location_text: locationText,
        pickup_address_line: addressLine,
        pickup_area: area,
        pickup_city: city,
        pickup_pincode: pincode,
        delivery_available: deliveryAvailable,
        variant_id: variantId,
        asset_identifier: "",
        image_urls: newUrls,
      });
      try {
        await partnerRentalAssetAction(created.id, "submit");
        return "created";
      } catch {
        return "draft";
      }
    },
    onSuccess: (result) => {
      notify(
        result === "updated"
          ? "Changes saved."
          : result === "created"
            ? "Item sent for review. It goes live once checked."
            : "Item saved as a draft. Send it for review from your list.",
        "success",
      );
      onSaved();
      onClose();
    },
    onError: (err: unknown) => setFormError(friendlyErrorMessage(err)),
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const dailyPaise = rupeesToPaise(dailyRate);
    const depositPaise = deposit.trim() === "" ? suggestedDeposit ?? null : rupeesToPaise(deposit);
    const qty = Number.parseInt(quantity.trim(), 10);
    if (!variant) return setFormError("Choose what you are renting.");
    if (!title.trim()) return setFormError("Give your item a name.");
    if (!addressLine.trim()) return setFormError("Add the street / building address.");
    if (!city.trim()) return setFormError("Add the city.");
    if (pincode.trim() && !/^[1-9][0-9]{5}$/.test(pincode.trim())) {
      return setFormError("Enter a valid 6-digit pincode.");
    }
    if (dailyPaise == null || dailyPaise < 1) return setFormError("Enter a daily rate in rupees, for example 250.");
    if (depositPaise == null) return setFormError("Enter the refundable deposit in rupees.");
    if (!Number.isFinite(qty) || qty < 1) return setFormError("Quantity must be at least 1.");
    if (photos.some((p) => p.uploading)) return setFormError("Wait for the photos to finish uploading.");
    if (photos.some((p) => p.error)) return setFormError("Remove the photos that failed to upload.");
    if (photos.length < 1) return setFormError("Add at least one photo. The first one is the cover.");

    const structured: Record<string, string | number | boolean> = {};
    for (const key of fieldKeys) {
      const raw = fields[key]?.trim() ?? "";
      const spec = props[key] ?? {};
      if (!raw) {
        if (requiredKeys.has(key)) return setFormError(`Fill in ${fieldLabel(key, spec).toLowerCase()}.`);
        continue;
      }
      if (spec.type === "boolean") structured[key] = raw === "true";
      else if ((spec.type === "integer" || spec.type === "number") && /^\d+(\.\d+)?$/.test(raw))
        structured[key] = Number(raw);
      else structured[key] = raw;
    }
    setFormError(null);
    save.mutate({
      title: title.trim(),
      description: description.trim(),
      addressLine: addressLine.trim(),
      area: area.trim(),
      city: city.trim(),
      pincode: pincode.trim(),
      deliveryAvailable,
      daily_rate_paise: dailyPaise,
      deposit_paise: depositPaise,
      quantity_available: qty,
      structured_fields: structured,
      newUrls: photos.filter((p) => !p.mediaId && p.remoteUrl).map((p) => p.remoteUrl as string),
    });
  }

  const uploading = photos.some((p) => p.uploading);

  return (
    <Sheet
      side="end"
      open
      onOpenChange={(open) => {
        if (!open && !save.isPending) onClose();
      }}
      title={isEdit ? "Edit item" : "Add an item"}
      description={
        isEdit
          ? "Changes show to customers as soon as you save."
          : "We check every item before it goes live, usually within a day."
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="submit" form={FORM_ID} disabled={save.isPending || uploading}>
            {save.isPending ? "Saving…" : isEdit ? "Save changes" : "Post item"}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} className="flex flex-col" onSubmit={onSubmit} noValidate>
        <Section title="What are you renting?">
          {isEdit ? (
            <p className="rounded-control bg-surface-sunken px-3 py-2 text-sm text-text">
              {existingPath
                ? `${existingPath.sub.name} · ${existingPath.serviceName}${
                    existingPath.variant.name !== existingPath.serviceName ? ` · ${existingPath.variant.name}` : ""
                  }`
                : "Category can’t be changed"}
            </p>
          ) : (
            <>
              <Field label="Category" required>
                <Select
                  id="rental-subcategory"
                  value={subcategorySlug}
                  onChange={(e) => {
                    setSubcategorySlug(e.target.value);
                    setServiceId("");
                    setVariantId("");
                    setFields({});
                    setDepositOverride(null);
                  }}
                >
                  <option value="">Select a category</option>
                  {taxonomy.map((sub) => (
                    <option key={sub.id} value={sub.slug}>
                      {sub.name}
                    </option>
                  ))}
                </Select>
              </Field>
              {selectedSub ? (
                <Field label="Item" required>
                  <Select
                    id="rental-service"
                    value={serviceId}
                    onChange={(e) => {
                      setServiceId(e.target.value);
                      const svc = selectedSub.services.find((s) => s.id === e.target.value);
                      setVariantId(svc?.variants[0]?.id ?? "");
                      setFields({});
                      setDepositOverride(null);
                    }}
                  >
                    <option value="">Select an item</option>
                    {selectedSub.services.map((svc) => (
                      <option key={svc.id} value={svc.id}>
                        {svc.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}
              {(selectedService?.variants.length ?? 0) > 1 ? (
                <Field label="Type" required>
                  <Select
                    id="rental-variant"
                    value={variantId}
                    onChange={(e) => {
                      setVariantId(e.target.value);
                      setFields({});
                      setDepositOverride(null);
                    }}
                  >
                    {selectedService?.variants.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}
            </>
          )}
        </Section>

        <Section title="Photos" hint={`The first photo is the cover. Up to ${MAX_PHOTOS}.`}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              void addFiles(event.target.files);
            }}
          />
          <ul className="grid grid-cols-3 gap-2">
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
                  onClick={() => removePhoto(photo)}
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
                  className="flex aspect-square w-full flex-col items-center justify-center gap-1.5 rounded-card border-2 border-dashed border-line-strong bg-surface-sunken text-text-secondary transition hover:border-action hover:bg-surface hover:text-navy-900"
                >
                  <Camera className="size-6" />
                  <span className="text-xs font-semibold">Add photo</span>
                </button>
              </li>
            ) : null}
          </ul>
        </Section>

        <Section title="Details">
          <Field label="Item name" required>
            <Input
              id="rental-title"
              value={title}
              maxLength={180}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Teak wood dining chair"
            />
          </Field>
          {fieldKeys.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {fieldKeys.map((key) => (
                <RentalFieldInput
                  key={`${variant?.id ?? ""}-${key}`}
                  fieldKey={key}
                  spec={props[key] ?? {}}
                  required={requiredKeys.has(key)}
                  value={fields[key] ?? ""}
                  onChange={(next) => setFields((current) => ({ ...current, [key]: next }))}
                />
              ))}
            </div>
          ) : null}
          <Field label="Description" showOptional={false}>
            <Textarea
              id="rental-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Condition, what is included, any rules."
            />
          </Field>
        </Section>

        <Section title="Price and stock">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Rent per day" required>
              <RupeeInput id="rental-rate" value={dailyRate} onChange={setDailyRate} placeholder="250" />
            </Field>
            <Field label="Refundable deposit" required>
              <RupeeInput id="rental-deposit" value={deposit} onChange={(v) => setDepositOverride(v)} />
            </Field>
          </div>
          <Field label="How many do you have?" required description="Identical pieces you can rent out at once.">
            <Input
              id="rental-quantity"
              inputMode="numeric"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="1"
            />
          </Field>
        </Section>

        <Section
          title="Pickup location & delivery"
          hint="Customers collect the item here. You can also offer delivery on request."
        >
          <Field label="Building / street address" required>
            <Input
              id="rental-address-line"
              value={addressLine}
              onChange={(e) => setAddressLine(e.target.value)}
              placeholder="e.g. Shop 4, Ground Floor, MG Road"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Area / Locality">
              <Input
                id="rental-area"
                value={area}
                onChange={(e) => setArea(e.target.value)}
                placeholder="e.g. Indiranagar"
              />
            </Field>
            <Field label="City" required>
              <Input
                id="rental-city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g. Bengaluru"
              />
            </Field>
          </div>
          <Field label="Pincode" required>
            <Input
              id="rental-pincode"
              inputMode="numeric"
              maxLength={6}
              value={pincode}
              onChange={(e) => setPincode(e.target.value)}
              placeholder="560038"
            />
          </Field>
          <div className="pt-1">
            <label className="flex cursor-pointer items-start gap-2.5 text-sm text-navy-900">
              <input
                type="checkbox"
                id="rental-delivery-available"
                checked={deliveryAvailable}
                onChange={(e) => setDeliveryAvailable(e.target.checked)}
                className="mt-0.5 rounded-xs border-line text-action focus:ring-action"
              />
              <div>
                <span className="font-semibold">Offer delivery on request</span>
                <p className="text-xs text-text-secondary">
                  Customers can request you deliver this item. You set the delivery price when they request it.
                </p>
              </div>
            </label>
          </div>
        </Section>

        {formError ? (
          <p role="alert" className="mb-4 rounded-control bg-danger-surface px-3 py-2 text-sm text-danger-text">
            {formError}
          </p>
        ) : null}
      </form>
    </Sheet>
  );
}

function RupeeInput({
  id,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm font-semibold text-text-secondary">
        ₹
      </span>
      <Input
        id={id}
        className="pl-8"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
