"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { friendlyErrorMessage } from "@vsolve/query";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Select,
  Textarea,
  formatMoney,
} from "@vsolve/ui";
import { Camera, MapPin, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";

import { usePartnerCapabilities } from "@/features/capability/queries";
import {
  createPartnerStayProperty,
  createPartnerStayUnit,
  fetchPartnerDefaultLocation,
  fetchPartnerStayProperties,
  fetchStayTaxonomy,
  listPartnerStayUnits,
  stayVariantChoices,
  submitPartnerStayProperty,
  updatePartnerStayProperty,
  updatePartnerStayUnit,
  uploadPartnerStayPhoto,
  type PatchedUpdateUnitRequest,
  type StayTaxonomySubcategory,
  type StayTaxonomyVariant,
  type StayUnit,
} from "@/features/stays/queries";
import { PropertyPhotoCarousel } from "@/features/stays/view/property-photo-carousel";
import { STAY_SECTIONS } from "@/features/stays/view/stay-sections";
import { SectionNav } from "@/features/workspace/view/section-nav";

const MAX_PHOTOS = 8;
const FALLBACK_ROOM_TYPES = ["Standard", "Deluxe", "Shared"];

type WorkspaceTab = "properties" | "rooms";

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

type UnitDraft = {
  name: string;
  nightlyRate: string;
  sharing: string;
  error: string | null;
};

type UnitEditDraft = {
  name: string;
  nightlyRate: string;
  sharing: string;
  error: string | null;
};

type PropertyEditDraft = {
  minStayNights: string;
  availableFrom: string;
  availableUntil: string;
  error: string | null;
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

function roomTypeOptions(schema: Record<string, unknown> | undefined): string[] {
  const roomType = schemaPropertyMap(schema).room_type;
  if (Array.isArray(roomType?.enum) && roomType.enum.length > 0) {
    return roomType.enum.map(String);
  }
  return FALLBACK_ROOM_TYPES;
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

function emptyUnitDraft(): UnitDraft {
  return { name: "", nightlyRate: "", sharing: "1", error: null };
}

function unitEditFrom(unit: StayUnit): UnitEditDraft {
  return {
    name: unit.name,
    nightlyRate: paiseToRupeeInput(unit.nightly_rate_paise),
    sharing: String(unit.sharing_count ?? 1),
    error: null,
  };
}

function propertyEditFrom(property: {
  min_stay_nights?: number;
  available_from?: string | null;
  available_until?: string | null;
}): PropertyEditDraft {
  return {
    minStayNights: String(property.min_stay_nights ?? 1),
    availableFrom: property.available_from ?? "",
    availableUntil: property.available_until ?? "",
    error: null,
  };
}

export function PartnerStaysWorkspace() {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<WorkspaceTab>("properties");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [subcategorySlug, setSubcategorySlug] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [location, setLocation] = useState("");
  const [defaultLocation, setDefaultLocation] = useState("");
  const [minStayNights, setMinStayNights] = useState("1");
  const [availableFrom, setAvailableFrom] = useState("");
  const [availableUntil, setAvailableUntil] = useState("");
  const [houseRules, setHouseRules] = useState("");
  const [cancellation, setCancellation] = useState("");
  const [photos, setPhotos] = useState<PhotoDraft[]>([]);
  const [structuredFields, setStructuredFields] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [unitDraft, setUnitDraft] = useState<UnitDraft>(emptyUnitDraft());
  const [unitEdits, setUnitEdits] = useState<Record<string, UnitEditDraft>>({});
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [propertyEdits, setPropertyEdits] = useState<Record<string, PropertyEditDraft>>({});

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

  const subcategories: StayTaxonomySubcategory[] = taxonomy.data ?? [];
  const selectedSub = subcategories.find((s) => s.slug === subcategorySlug);
  const selectedService = selectedSub?.services.find((s) => s.id === serviceId);
  const selectedVariant = selectedService?.variants.find((v) => v.id === variantId);
  const propertySchema = selectedVariant?.property_schema as Record<string, unknown> | undefined;
  const schemaProps = schemaPropertyMap(propertySchema);
  const schemaKeys = Object.keys(schemaProps);
  const requiredSchemaKeys = schemaRequiredKeys(propertySchema);

  const variantById = useMemo(() => {
    const map = new Map<string, StayTaxonomyVariant>();
    for (const sub of taxonomy.data ?? []) {
      for (const service of sub.services) {
        for (const variant of service.variants) {
          map.set(variant.id, variant);
        }
      }
    }
    return map;
  }, [taxonomy.data]);

  const selectedProperty =
    properties.data?.find((property) => property.id === selectedPropertyId) ??
    properties.data?.[0] ??
    null;
  const effectivePropertyId = selectedProperty?.id ?? null;
  const selectedRoomOptions = roomTypeOptions(
    variantById.get(selectedProperty?.variant ?? "")?.property_schema as
      | Record<string, unknown>
      | undefined,
  );

  const listedUnits = useQuery({
    queryKey: ["partner-stays", "units", effectivePropertyId],
    queryFn: () => listPartnerStayUnits(effectivePropertyId!),
    enabled: Boolean(effectivePropertyId),
  });
  const rooms: StayUnit[] =
    listedUnits.data ??
    ((selectedProperty?.units ?? []) as StayUnit[]);

  useEffect(() => {
    return () => {
      photos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["partner-stays"] });
  };

  const create = useMutation({
    mutationFn: createPartnerStayProperty,
    onSuccess: (created) => {
      photos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
      setTitle("");
      setDescription("");
      setSubcategorySlug("");
      setServiceId("");
      setVariantId("");
      setMinStayNights("1");
      setAvailableFrom("");
      setAvailableUntil("");
      setHouseRules("");
      setCancellation("");
      setPhotos([]);
      setStructuredFields({});
      setFormError(null);
      setSelectedPropertyId(created.id);
      setTab("rooms");
      setLocation(defaultLocation);
      invalidate();
    },
    onError: (err: unknown) => setFormError(friendlyErrorMessage(err)),
  });

  const createUnit = useMutation({
    mutationFn: ({
      propertyId,
      name,
      nightly_rate_paise,
      sharing_count,
    }: {
      propertyId: string;
      name: string;
      nightly_rate_paise: number;
      sharing_count: number;
    }) =>
      createPartnerStayUnit(propertyId, {
        name,
        nightly_rate_paise,
        sharing_count,
      }),
    onSuccess: () => {
      setUnitDraft(emptyUnitDraft());
      invalidate();
    },
    onError: (err: unknown) => {
      setUnitDraft((current) => ({ ...current, error: friendlyErrorMessage(err) }));
    },
  });

  const updateUnit = useMutation({
    mutationFn: ({
      unitId,
      patch,
    }: {
      unitId: string;
      patch: PatchedUpdateUnitRequest;
    }) => updatePartnerStayUnit(unitId, patch),
    onSuccess: (_data, vars) => {
      setEditingUnitId(null);
      setUnitEdits((current) => {
        const next = { ...current };
        delete next[vars.unitId];
        return next;
      });
      invalidate();
    },
    onError: (err: unknown, vars) => {
      setUnitEdits((current) => ({
        ...current,
        [vars.unitId]: {
          ...(current[vars.unitId] ?? unitEditFrom({ id: vars.unitId, name: "", nightly_rate_paise: 0 })),
          error: friendlyErrorMessage(err),
        },
      }));
    },
  });

  const updateProperty = useMutation({
    mutationFn: ({
      propertyId,
      min_stay_nights,
      available_from,
      available_until,
    }: {
      propertyId: string;
      min_stay_nights: number;
      available_from: string | null;
      available_until: string | null;
    }) =>
      updatePartnerStayProperty(propertyId, {
        min_stay_nights,
        available_from,
        available_until,
      }),
    onSuccess: (_data, vars) => {
      setPropertyEdits((current) => {
        const next = { ...current };
        delete next[vars.propertyId];
        return next;
      });
      invalidate();
    },
    onError: (err: unknown, vars) => {
      setPropertyEdits((current) => ({
        ...current,
        [vars.propertyId]: {
          ...(current[vars.propertyId] ?? propertyEditFrom({})),
          error: friendlyErrorMessage(err),
        },
      }));
    },
  });

  const submit = useMutation({
    mutationFn: submitPartnerStayProperty,
    onSuccess: invalidate,
    onError: (err: unknown) => setFormError(friendlyErrorMessage(err)),
  });

  const setUnitActive = useMutation({
    mutationFn: ({ unitId, is_active }: { unitId: string; is_active: boolean }) =>
      updatePartnerStayUnit(unitId, { is_active }),
    onSuccess: invalidate,
    onError: (err: unknown) => {
      setUnitDraft((current) => ({ ...current, error: friendlyErrorMessage(err) }));
    },
  });

  function patchPhoto(localId: string, patch: Partial<PhotoDraft>) {
    setPhotos((current) => current.map((photo) => (photo.localId === localId ? { ...photo, ...patch } : photo)));
  }

  function propertyEditFor(propertyId: string, property: Parameters<typeof propertyEditFrom>[0]) {
    return propertyEdits[propertyId] ?? propertyEditFrom(property);
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

  function onCreate(event: FormEvent) {
    event.preventDefault();
    const minNights = Number.parseInt(minStayNights.trim(), 10);
    if (!variantId || !title.trim()) {
      setFormError("Choose a category, service, and a property title.");
      return;
    }
    const resolvedLocation = location.trim() || defaultLocation.trim();
    if (!Number.isFinite(minNights) || minNights < 1) {
      setFormError("Minimum stay must be at least 1 night.");
      return;
    }
    if (availableFrom && availableUntil && availableUntil < availableFrom) {
      setFormError("Available until must be on or after available from.");
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
      location_text: resolvedLocation,
      min_stay_nights: minNights,
      available_from: availableFrom || null,
      available_until: availableUntil || null,
      structured_fields: fields,
      cancellation_policy_text: cancellation.trim(),
      house_rules: houseRules.trim(),
      image_urls: urls,
    });
  }

  function onCreateUnit(event: FormEvent) {
    event.preventDefault();
    if (!effectivePropertyId) {
      setUnitDraft((current) => ({ ...current, error: "Select a property first." }));
      return;
    }
    const nightlyPaise = rupeesToPaise(unitDraft.nightlyRate);
    const sharing = Number.parseInt(unitDraft.sharing.trim(), 10);
    if (!unitDraft.name.trim()) {
      setUnitDraft((current) => ({ ...current, error: "Choose a room type." }));
      return;
    }
    if (nightlyPaise == null || nightlyPaise < 1) {
      setUnitDraft((current) => ({ ...current, error: "Enter a nightly rate in rupees." }));
      return;
    }
    if (!Number.isFinite(sharing) || sharing < 1) {
      setUnitDraft((current) => ({ ...current, error: "Sharing count must be at least 1." }));
      return;
    }
    setUnitDraft((current) => ({ ...current, error: null }));
    createUnit.mutate({
      propertyId: effectivePropertyId,
      name: unitDraft.name.trim(),
      nightly_rate_paise: nightlyPaise,
      sharing_count: sharing,
    });
  }

  function onSaveUnit(event: FormEvent, unit: StayUnit) {
    event.preventDefault();
    const draft = unitEdits[unit.id] ?? unitEditFrom(unit);
    const nightlyPaise = rupeesToPaise(draft.nightlyRate);
    const sharing = Number.parseInt(draft.sharing.trim(), 10);
    if (!draft.name.trim()) {
      setUnitEdits((current) => ({
        ...current,
        [unit.id]: { ...draft, error: "Choose a room type." },
      }));
      return;
    }
    if (nightlyPaise == null || nightlyPaise < 1) {
      setUnitEdits((current) => ({
        ...current,
        [unit.id]: { ...draft, error: "Enter a nightly rate in rupees." },
      }));
      return;
    }
    if (!Number.isFinite(sharing) || sharing < 1) {
      setUnitEdits((current) => ({
        ...current,
        [unit.id]: { ...draft, error: "Sharing count must be at least 1." },
      }));
      return;
    }
    updateUnit.mutate({
      unitId: unit.id,
      patch: {
        name: draft.name.trim(),
        nightly_rate_paise: nightlyPaise,
        sharing_count: sharing,
      },
    });
  }

  function onSavePropertyEdit(event: FormEvent, propertyId: string) {
    event.preventDefault();
    const property = properties.data?.find((row) => row.id === propertyId);
    const draft = propertyEditFor(propertyId, {
      min_stay_nights: property?.min_stay_nights,
      available_from: property?.available_from,
      available_until: property?.available_until,
    });
    const minNights = Number.parseInt(draft.minStayNights.trim(), 10);
    if (!Number.isFinite(minNights) || minNights < 1) {
      setPropertyEdits((current) => ({
        ...current,
        [propertyId]: { ...draft, error: "Minimum stay must be at least 1 night." },
      }));
      return;
    }
    if (draft.availableFrom && draft.availableUntil && draft.availableUntil < draft.availableFrom) {
      setPropertyEdits((current) => ({
        ...current,
        [propertyId]: { ...draft, error: "Available until must be on or after available from." },
      }));
      return;
    }
    updateProperty.mutate({
      propertyId,
      min_stay_nights: minNights,
      available_from: draft.availableFrom || null,
      available_until: draft.availableUntil || null,
    });
  }

  const uploadingCount = photos.filter((photo) => photo.uploading).length;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-action">Stay listings</p>
        <h1 className="mt-1 text-2xl font-extrabold text-navy-900">List your property</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Register the property with photos first, then add rooms under it. Photos live on the
          property, not on each room. Guest enquiries and paid bookings have their own sections.
        </p>
      </div>

      <SectionNav label="Stay sections" items={STAY_SECTIONS} />

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["properties", "Properties"],
            ["rooms", "Rooms"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${
              tab === id
                ? "bg-action text-white"
                : "border border-line bg-surface text-text-secondary hover:text-navy-900"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "properties" ? (
        <>
          <Card padding="lg">
            <form className="flex flex-col gap-6" onSubmit={onCreate}>
              <Field
                label="Property photos"
                required
                description={`Photos belong to the property (not individual rooms). First photo is the cover. JPEG, PNG or WebP, up to ${MAX_PHOTOS}.`}
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
                <div className="flex flex-col gap-3">
                  {photos.length > 0 ? (
                    <PropertyPhotoCarousel
                      label={title.trim() || "New property"}
                      showThumbs
                      slides={photos.map((photo) => ({
                        id: photo.localId,
                        url: photo.previewUrl,
                      }))}
                    />
                  ) : null}
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
                </div>
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
                      setVariantId(svc?.variants[0]?.id ?? "");
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
              <Field
                label="Location"
                required
                description="Prefills from your partner profile address when set; edit per property."
              >
                <Input
                  id="stay-location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder={defaultLocation || "Area, city"}
                />
              </Field>
              <section className="grid gap-3 sm:grid-cols-3">
                <Field label="Minimum stay (nights)" required>
                  <Input
                    id="stay-min-nights"
                    inputMode="numeric"
                    value={minStayNights}
                    onChange={(e) => setMinStayNights(e.target.value)}
                    placeholder="1"
                  />
                </Field>
                <Field label="Available from" showOptional={false}>
                  <Input
                    id="stay-available-from"
                    type="date"
                    value={availableFrom}
                    onChange={(e) => setAvailableFrom(e.target.value)}
                  />
                </Field>
                <Field label="Available until" showOptional={false}>
                  <Input
                    id="stay-available-until"
                    type="date"
                    value={availableUntil}
                    onChange={(e) => setAvailableUntil(e.target.value)}
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
                {create.isPending ? "Registering property…" : "Register property"}
              </Button>
            </form>
          </Card>

          <section className="flex flex-col gap-3">
            <div>
              <h2 className="text-lg font-bold text-navy-900">Your properties</h2>
              <p className="text-sm text-text-secondary">
                Property photos show in the carousel on each card. Edit min stay and availability
                here. Open Rooms to add or edit units (rooms do not have separate photos).
              </p>
            </div>
            {properties.isLoading ? <p className="text-sm text-text-secondary">Loading…</p> : null}
            {properties.error ? (
              <p className="text-sm text-danger-text">{friendlyErrorMessage(properties.error)}</p>
            ) : null}
            {properties.data && properties.data.length === 0 ? (
              <EmptyState
                compact
                title="No properties yet"
                description="Register a property with photos, then add rooms."
              />
            ) : null}
            <ul className="flex flex-col gap-4">
              {properties.data?.map((property) => {
                const media = [...(property.media ?? [])].sort(
                  (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0),
                );
                const units = property.units ?? [];
                const activeUnits = units.filter((unit) => unit.is_active !== false);
                const nightly = activeUnits[0]?.nightly_rate_paise ?? units[0]?.nightly_rate_paise;
                const canSubmit =
                  (property.moderation_status === "DRAFT" ||
                    property.moderation_status === "REJECTED") &&
                  activeUnits.length > 0;
                const edit = propertyEditFor(property.id, property);
                const selected = effectivePropertyId === property.id;
                return (
                  <li key={property.id}>
                    <Card
                      padding="none"
                      className={`overflow-hidden ${selected ? "ring-2 ring-action" : ""}`}
                    >
                      <div className="grid gap-0 sm:grid-cols-[minmax(0,240px)_1fr]">
                        <div className="relative aspect-[4/3] bg-surface-sunken sm:aspect-auto sm:min-h-[180px]">
                          <PropertyPhotoCarousel
                            fill
                            label={property.title}
                            slides={media
                              .filter((item) => Boolean(item.url))
                              .map((item) => ({
                                id: item.id,
                                url: item.url,
                                caption: item.caption || property.title,
                              }))}
                            overlay={
                              <Badge className="absolute right-2 top-2 z-10">
                                {property.public_state}
                              </Badge>
                            }
                          />
                        </div>
                        <div className="flex flex-col gap-3 p-4">
                          <div className="flex flex-col gap-1">
                            {typeof nightly === "number" ? (
                              <p className="text-lg font-extrabold text-navy-900">
                                From {formatMoney(nightly)} / night
                              </p>
                            ) : (
                              <p className="text-sm font-semibold text-text-secondary">No rooms yet</p>
                            )}
                            <p className="font-semibold text-navy-900">{property.title}</p>
                            {property.location_text ? (
                              <p className="inline-flex items-center gap-1 text-sm text-text-secondary">
                                <MapPin className="size-3.5 shrink-0" />
                                {property.location_text}
                              </p>
                            ) : null}
                            <p className="text-xs text-text-secondary">
                              {activeUnits.length} room{activeUnits.length === 1 ? "" : "s"}
                              {units.length > activeUnits.length
                                ? ` · ${units.length - activeUnits.length} inactive`
                                : ""}
                            </p>
                          </div>

                          <form
                            className="grid gap-3 rounded-card border border-line bg-surface-sunken p-3 sm:grid-cols-4"
                            onSubmit={(event) => onSavePropertyEdit(event, property.id)}
                          >
                            <Field label="Min stay (nights)" required>
                              <Input
                                inputMode="numeric"
                                value={edit.minStayNights}
                                onChange={(e) =>
                                  setPropertyEdits((current) => ({
                                    ...current,
                                    [property.id]: {
                                      ...edit,
                                      minStayNights: e.target.value,
                                      error: null,
                                    },
                                  }))
                                }
                              />
                            </Field>
                            <Field label="Available from" showOptional={false}>
                              <Input
                                type="date"
                                value={edit.availableFrom}
                                onChange={(e) =>
                                  setPropertyEdits((current) => ({
                                    ...current,
                                    [property.id]: {
                                      ...edit,
                                      availableFrom: e.target.value,
                                      error: null,
                                    },
                                  }))
                                }
                              />
                            </Field>
                            <Field label="Available until" showOptional={false}>
                              <Input
                                type="date"
                                value={edit.availableUntil}
                                onChange={(e) =>
                                  setPropertyEdits((current) => ({
                                    ...current,
                                    [property.id]: {
                                      ...edit,
                                      availableUntil: e.target.value,
                                      error: null,
                                    },
                                  }))
                                }
                              />
                            </Field>
                            <div className="flex flex-col justify-end gap-2">
                              <Button type="submit" size="sm" disabled={updateProperty.isPending}>
                                {updateProperty.isPending ? "Saving…" : "Save dates"}
                              </Button>
                            </div>
                            {edit.error ? (
                              <p className="text-sm text-danger-text sm:col-span-4">{edit.error}</p>
                            ) : null}
                          </form>

                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant={selected ? "secondary" : "primary"}
                              onClick={() => {
                                setSelectedPropertyId(property.id);
                                setTab("rooms");
                              }}
                            >
                              Manage rooms
                            </Button>
                            {canSubmit ? (
                              <Button
                                size="sm"
                                variant="secondary"
                                disabled={submit.isPending}
                                onClick={() => {
                                  setFormError(null);
                                  submit.mutate(property.id);
                                }}
                              >
                                Submit for review
                              </Button>
                            ) : property.moderation_status === "DRAFT" ||
                              property.moderation_status === "REJECTED" ? (
                              <p className="text-xs text-text-secondary self-center">
                                Add at least one room before submitting.
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      ) : (
        <section className="flex flex-col gap-4">
          <Card padding="lg" className="flex flex-col gap-4">
            <Field label="Property" required description="Rooms are added under the selected property.">
              <Select
                id="stay-property-selector"
                value={effectivePropertyId ?? ""}
                onChange={(e) => {
                  setSelectedPropertyId(e.target.value || null);
                  setUnitDraft(emptyUnitDraft());
                  setEditingUnitId(null);
                }}
              >
                <option value="">Select a property</option>
                {properties.data?.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.title}
                  </option>
                ))}
              </Select>
            </Field>

            {!effectivePropertyId ? (
              <EmptyState
                compact
                title="Select a property"
                description="Register a property first, then come here to add rooms."
              />
            ) : (
              <>
                <div>
                  <h2 className="text-lg font-bold text-navy-900">
                    Rooms for {selectedProperty?.title ?? "property"}
                  </h2>
                  <p className="text-sm text-text-secondary">
                    Choose a room type from the dropdown, set rate and sharing. Property photos are
                    managed under the Properties tab — rooms do not have their own images.
                  </p>
                </div>

                {listedUnits.isLoading ? (
                  <p className="text-sm text-text-secondary">Loading rooms…</p>
                ) : null}
                {listedUnits.error ? (
                  <p className="text-sm text-danger-text">{friendlyErrorMessage(listedUnits.error)}</p>
                ) : null}

                {rooms.length === 0 ? (
                  <EmptyState
                    compact
                    title="No rooms yet"
                    description="Add a room with a nightly rate to start taking bookings."
                  />
                ) : (
                  <ul className="flex flex-col gap-3">
                    {rooms.map((unit) => {
                      const editing = editingUnitId === unit.id;
                      const draft = unitEdits[unit.id] ?? unitEditFrom(unit);
                      return (
                        <li key={unit.id} className="rounded-card border border-line p-3">
                          {!editing ? (
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <p className="font-semibold text-navy-900">
                                  {unit.name}
                                  {(unit.sharing_count ?? 1) > 1
                                    ? ` · shares ${unit.sharing_count}`
                                    : ""}
                                  {unit.is_active === false ? " · Inactive" : ""}
                                </p>
                                <p className="text-sm text-action font-semibold">
                                  {formatMoney(unit.nightly_rate_paise)} / night
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => {
                                    setEditingUnitId(unit.id);
                                    setUnitEdits((current) => ({
                                      ...current,
                                      [unit.id]: unitEditFrom(unit),
                                    }));
                                  }}
                                >
                                  Edit
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={setUnitActive.isPending}
                                  onClick={() =>
                                    setUnitActive.mutate({
                                      unitId: unit.id,
                                      is_active: unit.is_active === false,
                                    })
                                  }
                                >
                                  {unit.is_active === false ? "Reactivate" : "Deactivate"}
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <form
                              className="grid gap-3 sm:grid-cols-4"
                              onSubmit={(event) => onSaveUnit(event, unit)}
                            >
                              <Field label="Room type" required>
                                <Select
                                  value={draft.name}
                                  onChange={(e) =>
                                    setUnitEdits((current) => ({
                                      ...current,
                                      [unit.id]: { ...draft, name: e.target.value, error: null },
                                    }))
                                  }
                                >
                                  <option value="">Select room</option>
                                  {Array.from(
                                    new Set([draft.name, ...selectedRoomOptions].filter(Boolean)),
                                  ).map((option) => (
                                    <option key={option} value={option}>
                                      {option}
                                    </option>
                                  ))}
                                </Select>
                              </Field>
                              <Field label="Nightly rate" required>
                                <div className="relative">
                                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm font-semibold text-text-secondary">
                                    ₹
                                  </span>
                                  <Input
                                    className="pl-8"
                                    inputMode="decimal"
                                    value={draft.nightlyRate}
                                    onChange={(e) =>
                                      setUnitEdits((current) => ({
                                        ...current,
                                        [unit.id]: {
                                          ...draft,
                                          nightlyRate: e.target.value,
                                          error: null,
                                        },
                                      }))
                                    }
                                  />
                                </div>
                              </Field>
                              <Field label="Sharing" required>
                                <Input
                                  inputMode="numeric"
                                  value={draft.sharing}
                                  onChange={(e) =>
                                    setUnitEdits((current) => ({
                                      ...current,
                                      [unit.id]: {
                                        ...draft,
                                        sharing: e.target.value,
                                        error: null,
                                      },
                                    }))
                                  }
                                />
                              </Field>
                              <div className="flex flex-wrap items-end gap-2">
                                <Button type="submit" size="sm" disabled={updateUnit.isPending}>
                                  {updateUnit.isPending ? "Saving…" : "Save"}
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  disabled={updateUnit.isPending}
                                  onClick={() => setEditingUnitId(null)}
                                >
                                  Cancel
                                </Button>
                              </div>
                              {draft.error ? (
                                <p className="text-sm text-danger-text sm:col-span-4">{draft.error}</p>
                              ) : null}
                            </form>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}

                <form
                  className="grid gap-3 rounded-card border border-dashed border-line-strong bg-surface-sunken p-3 sm:grid-cols-4"
                  onSubmit={onCreateUnit}
                >
                  <Field label="Room type" required>
                    <Select
                      id="unit-name-new"
                      value={unitDraft.name}
                      onChange={(e) =>
                        setUnitDraft((current) => ({
                          ...current,
                          name: e.target.value,
                          error: null,
                        }))
                      }
                    >
                      <option value="">Select room</option>
                      {selectedRoomOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Nightly rate" required>
                    <div className="relative">
                      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm font-semibold text-text-secondary">
                        ₹
                      </span>
                      <Input
                        id="unit-rate-new"
                        className="pl-8"
                        inputMode="decimal"
                        value={unitDraft.nightlyRate}
                        onChange={(e) =>
                          setUnitDraft((current) => ({
                            ...current,
                            nightlyRate: e.target.value,
                            error: null,
                          }))
                        }
                      />
                    </div>
                  </Field>
                  <Field label="Sharing" required>
                    <Input
                      id="unit-sharing-new"
                      inputMode="numeric"
                      value={unitDraft.sharing}
                      onChange={(e) =>
                        setUnitDraft((current) => ({
                          ...current,
                          sharing: e.target.value,
                          error: null,
                        }))
                      }
                    />
                  </Field>
                  <div className="flex flex-col justify-end gap-2">
                    <Button type="submit" size="sm" disabled={createUnit.isPending}>
                      {createUnit.isPending ? "Adding…" : "Add room"}
                    </Button>
                  </div>
                  {unitDraft.error ? (
                    <p className="text-sm text-danger-text sm:col-span-4">{unitDraft.error}</p>
                  ) : null}
                </form>
              </>
            )}
          </Card>
        </section>
      )}
    </div>
  );
}
