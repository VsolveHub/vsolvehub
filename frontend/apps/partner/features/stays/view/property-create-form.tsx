"use client";

import { useMutation } from "@tanstack/react-query";
import { friendlyErrorMessage } from "@vsolve/query";
import { Button, Card, Field, Input, Select, Textarea } from "@vsolve/ui";
import { Camera, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import {
  createPartnerStayProperty,
  uploadPartnerStayPhoto,
  type StayProperty,
  type StayPropertyType,
} from "@/features/stays/queries";

import { AmenityChecklist } from "./amenity-checklist";
import { SchemaQuestions } from "./schema-questions";
import { collectSchemaAnswers, splitBySize } from "./stay-form-helpers";

const MAX_PHOTOS = 8;

type PhotoDraft = {
  localId: string;
  previewUrl: string;
  remoteUrl?: string;
  uploading: boolean;
  error?: string;
};

function newLocalId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Step one of listing a property: only what a guest needs to recognise it.
 *
 * Rooms and prices come next, on the property itself. Minimum stay, house rules
 * and an availability window are optional and live under "Edit details" — none
 * of them is needed to get started. The cancellation policy is the platform's,
 * so it is not asked at all.
 */
export function PropertyCreateForm({
  propertyTypes,
  defaultLocation,
  onCreated,
  onCancel,
}: {
  propertyTypes: readonly StayPropertyType[];
  defaultLocation: string;
  onCreated: (property: StayProperty) => void;
  onCancel?: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [variantId, setVariantId] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [amenities, setAmenities] = useState<Record<string, boolean>>({});
  const [tenantPreference, setTenantPreference] = useState("ANY");
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState(defaultLocation);
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<PhotoDraft[]>([]);
  const [error, setError] = useState<string | null>(null);

  const selected = propertyTypes.find((type) => type.variant.id === variantId);

  useEffect(() => {
    setLocation((current) => (current.trim() ? current : defaultLocation));
  }, [defaultLocation]);

  useEffect(() => {
    return () => photos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
    // Revoke only on unmount; each removal revokes its own preview.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const create = useMutation({
    mutationFn: createPartnerStayProperty,
    onSuccess: (created) => {
      photos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
      setPhotos([]);
      onCreated(created);
    },
    onError: (err: unknown) => setError(friendlyErrorMessage(err)),
  });

  function patchPhoto(localId: string, patch: Partial<PhotoDraft>) {
    setPhotos((current) =>
      current.map((photo) => (photo.localId === localId ? { ...photo, ...patch } : photo)),
    );
  }

  async function uploadSelectedFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    const remaining = MAX_PHOTOS - photos.length;
    if (remaining <= 0) {
      setError(`You can add up to ${MAX_PHOTOS} photos.`);
      return;
    }
    const { ok, tooLarge } = splitBySize(Array.from(fileList));
    const chosen = ok.slice(0, remaining);
    if (chosen.length === 0) {
      setError(tooLarge);
      return;
    }
    const drafts: PhotoDraft[] = chosen.map((file) => ({
      localId: newLocalId(),
      previewUrl: URL.createObjectURL(file),
      uploading: true,
    }));
    setPhotos((current) => [...current, ...drafts]);
    setError(tooLarge);
    await Promise.all(
      drafts.map(async (draft, index) => {
        const file = chosen[index];
        if (!file) return;
        try {
          const uploaded = await uploadPartnerStayPhoto(file);
          patchPhoto(draft.localId, { remoteUrl: uploaded.url, uploading: false });
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

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!selected) return setError("Choose the type of property.");
    if (!title.trim()) return setError("Give your property a name guests will recognise.");
    if (!location.trim()) return setError("Add the property's area and city.");
    if (photos.some((photo) => photo.uploading)) return setError("Wait for the photos to upload.");
    if (photos.some((photo) => photo.error)) {
      return setError("Remove the photos that failed, or try them again.");
    }
    const urls = photos.map((photo) => photo.remoteUrl).filter((url): url is string => Boolean(url));
    const collected = collectSchemaAnswers(selected.variant.property_schema, answers);
    if ("missing" in collected) return setError(`Choose ${collected.missing}.`);
    setError(null);
    create.mutate({
      variant_id: selected.variant.id,
      title: title.trim(),
      description: description.trim(),
      location_text: location.trim(),
      structured_fields: {
        ...collected.values,
        ...amenities,
        // tenant_preference is forwarded here until the dedicated model column lands.
        ...(tenantPreference && tenantPreference !== "ANY" ? { tenant_preference: tenantPreference } : {}),
      },
      image_urls: urls,
    });
  }

  const uploading = photos.some((photo) => photo.uploading);

  return (
    <Card padding="lg">
      <form className="flex flex-col gap-6" onSubmit={onSubmit}>
        <div>
          <h2 className="text-lg font-bold text-navy-900">Add a property</h2>
          <p className="text-sm text-text-secondary">
            Start with the basics. You add rooms and prices on the next step, then publish.
          </p>
        </div>

        <Field label="Type of property" required>
          <Select
            id="stay-property-type"
            value={variantId}
            onChange={(e) => {
              setVariantId(e.target.value);
              setAnswers({});
              setAmenities({});
            }}
          >
            <option value="">Select</option>
            {propertyTypes.map((type) => (
              <option key={type.variant.id} value={type.variant.id}>
                {type.label}
              </option>
            ))}
          </Select>
        </Field>

        {selected ? (
          <SchemaQuestions
            idPrefix="stay-field"
            schema={selected.variant.property_schema}
            answers={answers}
            onChange={setAnswers}
          />
        ) : null}

        {selected ? (
          <AmenityChecklist
            idPrefix="stay-amenity"
            options={selected.variant.amenity_options}
            value={amenities}
            onChange={setAmenities}
          />
        ) : null}

        {selected ? (
          <Field
            label="Who can stay here?"
            description="Helps guests self-filter before enquiring. Choose 'Anyone' if you welcome all."
          >
            <Select
              id="stay-tenant-preference"
              value={tenantPreference}
              onChange={(e) => setTenantPreference(e.target.value)}
            >
              <option value="ANY">Anyone</option>
              <option value="BACHELOR_MALE">Bachelor (male)</option>
              <option value="BACHELOR_FEMALE">Bachelor (female / ladies)</option>
              <option value="FAMILY">Family</option>
              <option value="WORKING_PROFESSIONAL">Working professional</option>
            </Select>
          </Field>
        ) : null}

        <Field label="Property name" required>
          <Input
            id="stay-title"
            value={title}
            maxLength={180}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Lakeview PG for working women"
          />
        </Field>

        <Field label="Location" required description="Area and city guests search by.">
          <Input
            id="stay-location"
            value={location}
            maxLength={180}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Madhapur, Hyderabad"
          />
        </Field>

        <Field
          label="Building & common area photos"
          showOptional={false}
          description={`Optional: the entrance, kitchen, washroom, street. Room photos are added with each room type next. Up to ${MAX_PHOTOS} photos, 10 MB each.`}
        >
          <input
            ref={fileInputRef}
            id="stay-photos"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="sr-only"
            onChange={(event) => void uploadSelectedFiles(event.target.files)}
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

        <Field label="Description" showOptional>
          <Textarea
            id="stay-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What makes it a good place to stay — meals, Wi-Fi, what's nearby."
          />
        </Field>

        {error ? <p className="text-sm text-danger-text">{error}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="lg" disabled={create.isPending || uploading}>
            {create.isPending ? "Saving…" : "Save and add rooms"}
          </Button>
          {onCancel ? (
            <Button type="button" variant="ghost" size="lg" onClick={onCancel}>
              Cancel
            </Button>
          ) : null}
        </div>
      </form>
    </Card>
  );
}
