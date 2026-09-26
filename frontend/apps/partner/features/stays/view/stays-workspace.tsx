"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Card, EmptyState, Field, Input, Select, Textarea, formatMoney } from "@vsolve/ui";
import { Camera, MapPin, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";

import { usePartnerCapabilities } from "@/features/capability/queries";
import {
  createPartnerStayProperty,
  fetchPartnerStayEnquiries,
  fetchPartnerStayProperties,
  fetchStayTaxonomy,
  respondPartnerStayEnquiry,
  stayVariantChoices,
  submitPartnerStayProperty,
  uploadPartnerStayPhoto,
  type StayTaxonomySubcategory,
} from "@/features/stays/queries";

const MAX_PHOTOS = 8;

type PhotoDraft = {
  localId: string;
  previewUrl: string;
  remoteUrl?: string;
  uploading: boolean;
  error?: string;
};

type SchemaProperty = {
  type?: string;
  enum?: unknown[];
};

function schemaPropertyMap(
  schema: Record<string, unknown> | undefined,
): Record<string, SchemaProperty> {
  const props = schema?.properties;
  if (!props || typeof props !== "object" || Array.isArray(props)) return {};
  return props as Record<string, SchemaProperty>;
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

function newLocalId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function sharingFromFields(fields: Record<string, string>): number {
  const raw = `${fields.occupancy ?? ""} ${fields.sharing ?? ""}`.toLowerCase();
  if (raw.includes("four")) return 4;
  if (raw.includes("triple")) return 3;
  if (raw.includes("double") || raw.includes("shared")) return 2;
  return 1;
}

const FIELD_LABELS: Record<string, string> = {
  ac: "AC",
  bathroom: "Bathroom",
  occupancy: "Occupancy",
  furnishing: "Furnishing",
  food: "Food",
  tier: "Tier",
  gender: "Gender",
  sharing: "Sharing",
  occupant: "Occupant",
  hostel_type: "Hostel type",
  room_type: "Room type",
  wifi: "Wi-Fi",
  layout: "Layout",
  parking: "Parking",
  property_type: "Property type",
  duration: "Duration",
  stay_type: "Stay type",
  capacity: "Capacity",
  listing_type: "Listing type",
};

function labelFor(key: string): string {
  return FIELD_LABELS[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function PartnerStaysWorkspace() {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [subcategorySlug, setSubcategorySlug] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [nightlyRate, setNightlyRate] = useState("");
  const [location, setLocation] = useState("");
  const [houseRules, setHouseRules] = useState("");
  const [cancellation, setCancellation] = useState("");
  const [photos, setPhotos] = useState<PhotoDraft[]>([]);
  const [structuredFields, setStructuredFields] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [responses, setResponses] = useState<Record<string, string>>({});

  const capabilities = usePartnerCapabilities();
  const capabilityVariants = stayVariantChoices(capabilities.data?.capabilities);
  const taxonomy = useQuery({
    queryKey: ["partner-stays", "taxonomy"],
    queryFn: fetchStayTaxonomy,
  });
  const properties = useQuery({
    queryKey: ["partner-stays", "properties"],
    queryFn: fetchPartnerStayProperties,
  });
  const enquiries = useQuery({
    queryKey: ["partner-stays", "enquiries"],
    queryFn: fetchPartnerStayEnquiries,
  });

  const subcategories: StayTaxonomySubcategory[] = taxonomy.data ?? [];
  const selectedSub = subcategories.find((s) => s.slug === subcategorySlug);
  const selectedService = selectedSub?.services.find((s) => s.id === serviceId);
  const selectedVariant = selectedService?.variants.find((v) => v.id === variantId);
  const propertySchema = selectedVariant?.property_schema as Record<string, unknown> | undefined;
  const schemaProps = useMemo(() => schemaPropertyMap(propertySchema), [propertySchema]);
  const schemaKeys = useMemo(() => Object.keys(schemaProps), [schemaProps]);
  const requiredSchemaKeys = useMemo(() => schemaRequiredKeys(propertySchema), [propertySchema]);

  useEffect(() => {
    return () => {
      photos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["partner-stays"] });
  };

  const create = useMutation({
    mutationFn: createPartnerStayProperty,
    onSuccess: () => {
      photos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
      setTitle("");
      setDescription("");
      setSubcategorySlug("");
      setServiceId("");
      setVariantId("");
      setNightlyRate("");
      setLocation("");
      setHouseRules("");
      setCancellation("");
      setPhotos([]);
      setStructuredFields({});
      setFormError(null);
      invalidate();
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const submit = useMutation({
    mutationFn: submitPartnerStayProperty,
    onSuccess: invalidate,
  });

  const respond = useMutation({
    mutationFn: ({ id, response }: { id: string; response: string }) =>
      respondPartnerStayEnquiry(id, response),
    onSuccess: (_data, vars) => {
      setResponses((current) => ({ ...current, [vars.id]: "" }));
      invalidate();
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
          const uploaded = await uploadPartnerStayPhoto(file);
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
    const nightlyPaise = rupeesToPaise(nightlyRate);
    if (!variantId || !title.trim()) {
      setFormError("Choose a category, service, and a property title.");
      return;
    }
    if (!location.trim()) {
      setFormError("Add the property location.");
      return;
    }
    if (nightlyPaise == null || nightlyPaise < 1) {
      setFormError("Enter a nightly rate in rupees, for example 850 or 849.50.");
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
      setFormError("Add at least one photo. Guests see the first photo as the cover.");
      return;
    }
    const fields: Record<string, string | number | boolean> = {};
    for (const key of schemaKeys) {
      const raw = structuredFields[key]?.trim() ?? "";
      if (!raw) {
        if (requiredSchemaKeys.has(key)) {
          setFormError(`Choose ${labelFor(key)}.`);
          return;
        }
        continue;
      }
      if (raw === "true" || raw === "false") fields[key] = raw === "true";
      else if (schemaProps[key]?.type === "number") fields[key] = Number(raw);
      else fields[key] = raw;
    }
    setFormError(null);
    create.mutate({
      variant_id: variantId,
      title: title.trim(),
      description: description.trim(),
      location_text: location.trim(),
      nightly_rate_paise: nightlyPaise,
      sharing_count: sharingFromFields(structuredFields),
      structured_fields: fields,
      cancellation_policy_text: cancellation.trim(),
      house_rules: houseRules.trim(),
      image_urls: urls,
    });
  }

  const uploadingCount = photos.filter((photo) => photo.uploading).length;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-action">Stay listings</p>
        <h1 className="mt-1 text-2xl font-extrabold text-navy-900">List your property</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Photos first, then the stay type. Options change with the category and service you pick.
        </p>
      </div>

      <Card padding="lg">
        <form className="flex flex-col gap-6" onSubmit={onCreate}>
          <Field
            label="Photos"
            required
            description={`First photo is the cover. JPEG, PNG or WebP, up to ${MAX_PHOTOS} photos.`}
          >
            <input
              ref={fileInputRef}
              id="stay-photos"
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

          <section className="grid gap-3 sm:grid-cols-2">
            <Field label="Category" required>
              <Select
                id="stay-subcategory"
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
                id="stay-service"
                value={serviceId}
                disabled={!selectedSub}
                onChange={(e) => {
                  setServiceId(e.target.value);
                  setStructuredFields({});
                  const svc = selectedSub?.services.find((s) => s.id === e.target.value);
                  const first = svc?.variants[0];
                  setVariantId(first?.id ?? "");
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
          </section>

          {selectedService && selectedService.variants.length > 1 ? (
            <Field label="Variant" required>
              <Select
                id="stay-variant"
                value={variantId}
                onChange={(e) => {
                  setVariantId(e.target.value);
                  setStructuredFields({});
                }}
              >
                <option value="">Select a variant</option>
                {selectedService.variants.map((variant) => (
                  <option key={variant.id} value={variant.id}>
                    {variant.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          {schemaKeys.length > 0 ? (
            <section className="grid gap-3 sm:grid-cols-2">
              {schemaKeys.map((key) => {
                const spec = schemaProps[key] ?? {};
                const enums = Array.isArray(spec.enum) ? spec.enum.map(String) : null;
                const required = requiredSchemaKeys.has(key);
                if (enums || spec.type === "boolean") {
                  const options = enums ?? ["true", "false"];
                  return (
                    <Field key={key} label={labelFor(key)} required={required} showOptional={false}>
                      <Select
                        id={`stay-field-${key}`}
                        value={structuredFields[key] ?? ""}
                        onChange={(e) =>
                          setStructuredFields((current) => ({ ...current, [key]: e.target.value }))
                        }
                      >
                        <option value="">Select {labelFor(key)}</option>
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
                  <Field key={key} label={labelFor(key)} required={required} showOptional={false}>
                    <Input
                      id={`stay-field-${key}`}
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
          ) : null}

          <Field label="Property title" required>
            <Input
              id="stay-title"
              value={title}
              maxLength={180}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Lakeview double sharing PG"
            />
          </Field>
          <Field label="Description" showOptional={false}>
            <Textarea
              id="stay-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Rooms, meals, Wi-Fi, and house notes guests should know."
            />
          </Field>

          <section className="grid gap-3 sm:grid-cols-2">
            <Field label="Nightly rate" required description="Amount in rupees. Guests see this per night.">
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm font-semibold text-text-secondary">
                  ₹
                </span>
                <Input
                  id="stay-rate"
                  className="pl-8"
                  inputMode="decimal"
                  value={nightlyRate}
                  onChange={(e) => setNightlyRate(e.target.value)}
                />
              </div>
            </Field>
            <Field label="Location" required>
              <Input
                id="stay-location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Area, city"
              />
            </Field>
          </section>

          <Field label="House rules" showOptional={false}>
            <Textarea
              id="stay-rules"
              value={houseRules}
              onChange={(e) => setHouseRules(e.target.value)}
              placeholder="Gate time, visitors, smoking, quiet hours."
            />
          </Field>
          <Field label="Cancellation policy" showOptional={false}>
            <Textarea
              id="stay-cancel"
              value={cancellation}
              onChange={(e) => setCancellation(e.target.value)}
              placeholder="When a guest can cancel without a charge."
            />
          </Field>

          {!taxonomy.data?.length && capabilityVariants.length > 0 ? (
            <p className="text-sm text-text-secondary">
              Taxonomy is still loading. You can only post against approved stay variants after it arrives.
            </p>
          ) : null}

          {formError ? <p className="text-sm text-danger-text">{formError}</p> : null}
          <Button type="submit" size="lg" disabled={create.isPending || uploadingCount > 0}>
            {create.isPending ? "Listing property…" : "List property"}
          </Button>
        </form>
      </Card>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-bold text-navy-900">Your properties</h2>
          <p className="text-sm text-text-secondary">Submit a draft when the photos and rate look right.</p>
        </div>
        {properties.isLoading ? <p className="text-sm text-text-secondary">Loading…</p> : null}
        {properties.error ? (
          <p className="text-sm text-danger-text">{(properties.error as Error).message}</p>
        ) : null}
        {properties.data && properties.data.length === 0 ? (
          <EmptyState compact title="No properties yet" description="List a property with photos to take enquiries." />
        ) : null}
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {properties.data?.map((property) => {
            const media = (property as { media?: { url?: string }[] }).media;
            const thumb = media?.[0]?.url;
            const nightly = property.units?.[0]?.nightly_rate_paise;
            const canSubmit =
              property.moderation_status === "DRAFT" || property.moderation_status === "REJECTED";
            return (
              <li key={property.id}>
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
                    <Badge className="absolute right-2 top-2">{property.public_state}</Badge>
                  </div>
                  <div className="flex flex-col gap-2 p-3">
                    {typeof nightly === "number" ? (
                      <p className="text-lg font-extrabold text-navy-900">{formatMoney(nightly)} / night</p>
                    ) : null}
                    <p className="font-semibold text-navy-900">{property.title}</p>
                    {property.location_text ? (
                      <p className="inline-flex items-center gap-1 text-sm text-text-secondary">
                        <MapPin className="size-3.5 shrink-0" />
                        {property.location_text}
                      </p>
                    ) : null}
                    {canSubmit ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={submit.isPending}
                        onClick={() => submit.mutate(property.id)}
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
        <h2 className="mb-3 text-base font-semibold text-navy-900">Enquiries</h2>
        {enquiries.isLoading ? <p className="text-sm text-text-secondary">Loading…</p> : null}
        {enquiries.error ? (
          <p className="text-sm text-danger-text">{(enquiries.error as Error).message}</p>
        ) : null}
        {enquiries.data && enquiries.data.length === 0 ? (
          <EmptyState compact title="No enquiries yet" description="Guest questions show up here." />
        ) : null}
        <ul className="flex flex-col gap-3">
          {enquiries.data?.map((enquiry) => {
            const draft = responses[enquiry.id] ?? "";
            return (
              <li key={enquiry.id} className="rounded-card border border-line p-3">
                <p className="font-semibold text-navy-900">{enquiry.property_title}</p>
                <p className="text-sm text-text-secondary">
                  {enquiry.status} · {enquiry.check_in} – {enquiry.check_out}
                  {typeof enquiry.total_quote_paise === "number"
                    ? ` · ${formatMoney(enquiry.total_quote_paise)}`
                    : ""}
                </p>
                {enquiry.message ? <p className="mt-2 text-sm">{enquiry.message}</p> : null}
                {enquiry.status === "SUBMITTED" ? (
                  <form
                    className="mt-3 flex flex-col gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (!draft.trim()) return;
                      respond.mutate({ id: enquiry.id, response: draft.trim() });
                    }}
                  >
                    <Field label="Your response">
                      <Textarea
                        id={`enquiry-${enquiry.id}`}
                        value={draft}
                        onChange={(e) =>
                          setResponses((current) => ({ ...current, [enquiry.id]: e.target.value }))
                        }
                      />
                    </Field>
                    <Button type="submit" size="sm" disabled={respond.isPending || !draft.trim()}>
                      Respond
                    </Button>
                  </form>
                ) : enquiry.host_response ? (
                  <p className="mt-2 text-sm">{enquiry.host_response}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
