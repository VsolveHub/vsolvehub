"use client";

import { useMutation } from "@tanstack/react-query";
import { friendlyErrorMessage } from "@vsolve/query";
import { Button, Card, Field, Input, Select, Textarea, useT } from "@vsolve/ui";
import { Camera, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import {
  createPartnerStayProperty,
  uploadPartnerStayPhoto,
  type StayProperty,
  type StayPropertyType,
} from "@/features/stays/queries";

import { FindOnMap } from "@/features/location/view/find-on-map";

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
  const t = useT();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [variantId, setVariantId] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [amenities, setAmenities] = useState<Record<string, boolean>>({});
  const [tenantPreference, setTenantPreference] = useState("ANY");
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState(defaultLocation);
  const [pin, setPin] = useState<{ latitude: string; longitude: string } | null>(null);
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
      setError(t("stays.property.maxPhotos", { n: MAX_PHOTOS }));
      return;
    }
    const { ok, tooLarge } = splitBySize(Array.from(fileList), t);
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
            error: friendlyErrorMessage(err, t("stays.property.uploadFailed")),
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
    if (!selected) return setError(t("stays.property.typeMissing"));
    if (!title.trim()) return setError(t("stays.property.nameMissing"));
    if (!location.trim()) return setError(t("stays.property.locationMissing"));
    if (photos.some((photo) => photo.uploading)) return setError(t("stays.property.waitForUpload"));
    if (photos.some((photo) => photo.error)) {
      return setError(t("stays.property.removeFailed"));
    }
    const urls = photos.map((photo) => photo.remoteUrl).filter((url): url is string => Boolean(url));
    const collected = collectSchemaAnswers(selected.variant.property_schema, answers, t);
    if ("missing" in collected) {
      return setError(t("stays.property.chooseMissing", { field: collected.missing }));
    }
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
      pin,
    });
  }

  const uploading = photos.some((photo) => photo.uploading);

  return (
    <Card padding="lg">
      <form className="flex flex-col gap-6" onSubmit={onSubmit}>
        <div>
          <h2 className="text-lg font-bold text-navy-900">{t("stays.workspace.addProperty")}</h2>
          <p className="text-sm text-text-secondary">
            {t("stays.property.createIntro")}
          </p>
        </div>

        <Field label={t("stays.property.typeLabel")} required>
          <Select
            id="stay-property-type"
            value={variantId}
            onChange={(e) => {
              setVariantId(e.target.value);
              setAnswers({});
              setAmenities({});
            }}
          >
            <option value="">{t("stays.schema.select")}</option>
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
            label={t("stays.property.tenantLabel")}
            description={t("stays.property.tenantDescription")}
          >
            <Select
              id="stay-tenant-preference"
              value={tenantPreference}
              onChange={(e) => setTenantPreference(e.target.value)}
            >
              <option value="ANY">{t("stays.property.tenant.any")}</option>
              <option value="BACHELOR_MALE">{t("stays.property.tenant.bachelorMale")}</option>
              <option value="BACHELOR_FEMALE">{t("stays.property.tenant.bachelorFemale")}</option>
              <option value="FAMILY">{t("stays.property.tenant.family")}</option>
              <option value="WORKING_PROFESSIONAL">{t("stays.property.tenant.workingProfessional")}</option>
            </Select>
          </Field>
        ) : null}

        <Field label={t("stays.property.nameLabel")} required>
          <Input
            id="stay-title"
            value={title}
            maxLength={180}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("stays.property.namePlaceholder")}
          />
        </Field>

        <Field
          label={t("stays.property.locationLabel")}
          required
          description={t("stays.property.locationDescription")}
        >
          <Input
            id="stay-location"
            value={location}
            maxLength={180}
            onChange={(e) => setLocation(e.target.value)}
            placeholder={t("stays.property.locationPlaceholder")}
          />
        </Field>
        <div className="-mt-2">
          <FindOnMap
            title={t("stays.property.findOnMap")}
            pin={pin}
            onPicked={(picked) => {
              setPin({ latitude: picked.latitude, longitude: picked.longitude });
              // This field is "area, city" by definition, so the pin replaces it.
              const areaAndCity = [picked.locality, picked.city].filter(Boolean).join(", ");
              if (areaAndCity) setLocation(areaAndCity);
            }}
          />
          <p className="mt-1.5 text-xs text-text-secondary">
            {t("stays.property.mapPrivacy")}
          </p>
        </div>

        <Field
          label={t("stays.property.photosLabel")}
          showOptional={false}
          description={t("stays.property.photosDescription", { n: MAX_PHOTOS })}
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
                    {t("stays.property.cover")}
                  </span>
                ) : null}
                {photo.uploading ? (
                  <span className="absolute inset-x-0 bottom-0 bg-navy-900/80 px-2 py-1 text-center text-[11px] font-medium text-white">
                    {t("stays.photos.uploading")}
                  </span>
                ) : null}
                {photo.error ? (
                  <span className="absolute inset-x-0 bottom-0 bg-danger-text px-2 py-1 text-center text-[11px] font-medium text-white">
                    {t("stays.property.failed")}
                  </span>
                ) : null}
                <button
                  type="button"
                  className="absolute right-1.5 top-1.5 inline-flex size-7 items-center justify-center rounded-full bg-white/95 text-navy-900 shadow-xs"
                  onClick={() => removePhoto(photo.localId)}
                  aria-label={t("stays.photos.remove")}
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
                  <span className="text-xs font-semibold">{t("stays.photos.add")}</span>
                </button>
              </li>
            ) : null}
          </ul>
        </Field>

        <Field label={t("stays.property.descriptionLabel")} showOptional>
          <Textarea
            id="stay-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("stays.property.descriptionPlaceholder")}
          />
        </Field>

        {error ? <p className="text-sm text-danger-text">{error}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="lg" disabled={create.isPending || uploading}>
            {create.isPending ? t("stays.visitingHours.saving") : t("stays.property.saveAndAddRooms")}
          </Button>
          {onCancel ? (
            <Button type="button" variant="ghost" size="lg" onClick={onCancel}>
              {t("common.cancel")}
            </Button>
          ) : null}
        </div>
      </form>
    </Card>
  );
}
