"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { friendlyErrorMessage } from "@vsolve/query";
import { Badge, Button, Card, Field, Input, Textarea, formatMoney, useT } from "@vsolve/ui";
import { Camera, MapPin, X } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";

import {
  addPartnerStayPropertyMedia,
  deletePartnerStayPropertyMedia,
  partnerStayPropertyAction,
  ratePeriodSuffix,
  stayListingStatus,
  updatePartnerStayProperty,
  uploadPartnerStayPhoto,
  type StayProperty,
  type StayPropertyAction,
  type StayTaxonomyVariant,
} from "@/features/stays/queries";

import { PropertyPhotoCarousel } from "./property-photo-carousel";
import { PropertyRooms } from "./property-rooms";
import { VisitingHours } from "./visiting-hours";
import { AmenityChecklist } from "./amenity-checklist";
import { SchemaQuestions } from "./schema-questions";
import {
  amenitiesFrom,
  answersFrom,
  collectSchemaAnswers,
  splitBySize,
  wholeNumber,
} from "./stay-form-helpers";

type Panel = "rooms" | "details" | "photos" | "visits" | null;

type DetailsDraft = {
  title: string;
  location: string;
  description: string;
  houseRules: string;
  minStay: string;
  answers: Record<string, string>;
  amenities: Record<string, boolean>;
};

function detailsFrom(property: StayProperty, variant: StayTaxonomyVariant | undefined): DetailsDraft {
  return {
    title: property.title,
    location: property.location_text ?? "",
    description: property.description ?? "",
    houseRules: property.house_rules ?? "",
    minStay: String(property.min_stay_nights ?? 1),
    answers: answersFrom(property.structured_fields),
    amenities: amenitiesFrom(property.structured_fields, variant?.amenity_options),
  };
}

/** What the host sees about where the property stands and what they can do next. */
function statusNote(property: StayProperty, t: ReturnType<typeof useT>): string | null {
  const activeRooms = (property.units ?? []).filter((unit) => unit.is_active !== false).length;
  if (property.listing_status === "ARCHIVED") {
    return t("stays.card.note.archived");
  }
  switch (property.moderation_status) {
    case "DRAFT":
      return activeRooms > 0
        ? t("stays.card.note.draftReady")
        : t("stays.card.note.draftNoRooms");
    case "PENDING":
      return t("stays.card.note.pending");
    case "REJECTED":
      return t("stays.card.note.rejected");
    case "REMOVED":
      return t("stays.card.note.removed");
    default:
      return property.listing_status === "PAUSED"
        ? t("stays.card.note.paused")
        : null;
  }
}

export function PropertyCard({
  property,
  variant,
  initialPanel = null,
}: {
  property: StayProperty;
  variant: StayTaxonomyVariant | undefined;
  initialPanel?: Panel;
}) {
  const t = useT();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [panel, setPanel] = useState<Panel>(initialPanel);
  const [details, setDetails] = useState<DetailsDraft>(() => detailsFrom(property, variant));
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["partner-stays"] });
  const status = stayListingStatus(property, t);
  const media = [...(property.media ?? [])].sort(
    (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0),
  );
  const rooms = property.units ?? [];
  const activeRooms = rooms.filter((unit) => unit.is_active !== false);
  const cheapest = activeRooms.reduce<number | null>(
    (lowest, unit) =>
      lowest === null || unit.nightly_rate_paise < lowest ? unit.nightly_rate_paise : lowest,
    null,
  );
  const approved = property.moderation_status === "APPROVED";
  const perNight = property.price_period === "NIGHT";
  const archived = property.listing_status === "ARCHIVED";
  const canPublish =
    !archived &&
    (property.moderation_status === "DRAFT" || property.moderation_status === "REJECTED");
  const note = statusNote(property, t);

  const act = useMutation({
    mutationFn: (action: StayPropertyAction) => partnerStayPropertyAction(property.id, action),
    onSuccess: () => {
      setActionError(null);
      invalidate();
    },
    onError: (err: unknown) => setActionError(friendlyErrorMessage(err)),
  });

  const saveDetails = useMutation({
    mutationFn: (patch: Parameters<typeof updatePartnerStayProperty>[1]) =>
      updatePartnerStayProperty(property.id, patch),
    onSuccess: () => {
      setPanel(null);
      invalidate();
    },
    onError: (err: unknown) => setDetailsError(friendlyErrorMessage(err)),
  });

  const removePhoto = useMutation({
    mutationFn: (mediaId: string) => deletePartnerStayPropertyMedia(property.id, mediaId),
    onSuccess: () => {
      setPhotoError(null);
      invalidate();
    },
    onError: (err: unknown) => setPhotoError(friendlyErrorMessage(err)),
  });

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    const { ok, tooLarge } = splitBySize(Array.from(files), t);
    setPhotoError(tooLarge);
    if (ok.length === 0) return;
    setUploading(true);
    try {
      let order = media.length;
      for (const file of ok) {
        const uploaded = await uploadPartnerStayPhoto(file);
        await addPartnerStayPropertyMedia(property.id, { url: uploaded.url, display_order: order });
        order += 1;
      }
      invalidate();
    } catch (err) {
      setPhotoError(friendlyErrorMessage(err, t("stays.card.addPhotoFailed")));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function onSaveDetails(event: FormEvent) {
    event.preventDefault();
    if (!details.title.trim()) return setDetailsError(t("stays.card.nameMissing"));
    if (!details.location.trim()) return setDetailsError(t("stays.card.locationMissing"));
    const minStay = wholeNumber(details.minStay);
    if (minStay === null) {
      return setDetailsError(
        perNight ? t("stays.card.minStayInvalidNight") : t("stays.card.minStayInvalidMonth"),
      );
    }
    const collected = collectSchemaAnswers(variant?.property_schema, details.answers, t);
    if ("missing" in collected) {
      return setDetailsError(t("stays.property.chooseMissing", { field: collected.missing }));
    }
    setDetailsError(null);
    saveDetails.mutate({
      title: details.title.trim(),
      location_text: details.location.trim(),
      description: details.description.trim(),
      house_rules: details.houseRules.trim(),
      min_stay_nights: minStay,
      structured_fields: { ...collected.values, ...details.amenities },
    });
  }

  function toggle(next: Exclude<Panel, null>) {
    if (next === "details") setDetails(detailsFrom(property, variant));
    setPanel((current) => (current === next ? null : next));
  }

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="grid gap-0 sm:grid-cols-[minmax(0,240px)_1fr]">
        <div className="relative aspect-[4/3] bg-surface-sunken sm:aspect-auto sm:min-h-[180px]">
          <PropertyPhotoCarousel
            fill
            label={property.title}
            slides={
              // Building photos first; with none, the room photos stand in.
              media.length > 0
                ? media
                    .filter((item) => Boolean(item.url))
                    .map((item) => ({ id: item.id, url: item.url, caption: item.caption || property.title }))
                : (property.units ?? []).flatMap((unit) =>
                    (unit.media ?? []).map((item) => ({ id: item.id, url: item.url, caption: unit.name })),
                  )
            }
            overlay={
              <Badge tone={status.tone} className="absolute right-2 top-2 z-10">
                {status.label}
              </Badge>
            }
          />
        </div>
        <div className="flex flex-col gap-3 p-4">
          <div className="flex flex-col gap-1">
            <p className="font-semibold text-navy-900">{property.title}</p>
            {property.location_text ? (
              <p className="inline-flex items-center gap-1 text-sm text-text-secondary">
                <MapPin className="size-3.5 shrink-0" />
                {property.location_text}
              </p>
            ) : null}
            <p className="text-sm text-text-secondary">
              {cheapest !== null
                ? `${t("stays.card.fromPrice", {
                    price: formatMoney(cheapest),
                    period: ratePeriodSuffix(property.price_period, t),
                  })} · `
                : ""}
              {t("stays.card.roomsAvailable", {
                available: rooms.reduce((n, unit) => n + (unit.available_count ?? 0), 0),
                total: rooms.reduce((n, unit) => n + (unit.quantity ?? 0), 0),
              })}
            </p>
            {note ? <p className="text-xs text-text-secondary">{note}</p> : null}
            {(property.moderation_status === "REJECTED" ||
              property.moderation_status === "REMOVED") &&
            property.moderation_reason ? (
              <p className="text-sm text-danger-text">{property.moderation_reason}</p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            {canPublish ? (
              <Button
                size="sm"
                disabled={act.isPending || activeRooms.length === 0}
                onClick={() => act.mutate("publish")}
              >
                {act.isPending ? t("stays.card.publishing") : t("stays.card.publish")}
              </Button>
            ) : null}
            {approved && property.listing_status === "LIVE" ? (
              <Button
                size="sm"
                variant="outline"
                disabled={act.isPending}
                onClick={() => act.mutate("pause")}
              >
                {t("stays.card.pause")}
              </Button>
            ) : null}
            {approved && property.listing_status === "PAUSED" ? (
              <Button size="sm" disabled={act.isPending} onClick={() => act.mutate("resume")}>
                {t("stays.card.resume")}
              </Button>
            ) : null}
            {!archived ? (
              <>
                <Button
                  size="sm"
                  variant={panel === "rooms" ? "secondary" : "outline"}
                  onClick={() => toggle("rooms")}
                >
                  {t("stays.card.rooms")}
                </Button>
                <Button
                  size="sm"
                  variant={panel === "details" ? "secondary" : "outline"}
                  onClick={() => toggle("details")}
                >
                  {t("stays.card.editDetails")}
                </Button>
                <Button
                  size="sm"
                  variant={panel === "photos" ? "secondary" : "outline"}
                  onClick={() => toggle("photos")}
                >
                  {t("stays.card.buildingPhotos")}
                </Button>
                <Button
                  size="sm"
                  variant={panel === "visits" ? "secondary" : "outline"}
                  onClick={() => toggle("visits")}
                >
                  {t("stays.visitingHours.heading")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={act.isPending}
                  onClick={() => act.mutate("archive")}
                >
                  {t("stays.card.archive")}
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled={act.isPending}
                onClick={() => act.mutate("restore")}
              >
                {t("stays.card.restore")}
              </Button>
            )}
          </div>
          {actionError ? <p className="text-sm text-danger-text">{actionError}</p> : null}
        </div>
      </div>

      {panel === "rooms" ? (
        <div className="border-t border-line p-4">
          <PropertyRooms property={property} variant={variant} />
        </div>
      ) : null}

      {panel === "details" ? (
        <form className="flex flex-col gap-4 border-t border-line p-4" onSubmit={onSaveDetails}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("stays.property.nameLabel")} required>
              <Input
                id={`title-${property.id}`}
                value={details.title}
                maxLength={180}
                onChange={(e) => setDetails({ ...details, title: e.target.value })}
              />
            </Field>
            <Field label={t("stays.property.locationLabel")} required>
              <Input
                id={`location-${property.id}`}
                value={details.location}
                maxLength={180}
                onChange={(e) => setDetails({ ...details, location: e.target.value })}
              />
            </Field>
          </div>
          <SchemaQuestions
            idPrefix={`details-${property.id}`}
            schema={variant?.property_schema}
            answers={details.answers}
            onChange={(answers) => setDetails({ ...details, answers })}
          />
          <AmenityChecklist
            idPrefix={`amenity-${property.id}`}
            options={variant?.amenity_options}
            value={details.amenities}
            onChange={(amenities) => setDetails({ ...details, amenities })}
          />
          <Field label={t("stays.property.descriptionLabel")} showOptional>
            <Textarea
              id={`description-${property.id}`}
              value={details.description}
              onChange={(e) => setDetails({ ...details, description: e.target.value })}
            />
          </Field>
          <Field label={t("stays.card.houseRules")} showOptional>
            <Textarea
              id={`rules-${property.id}`}
              value={details.houseRules}
              placeholder={t("stays.card.houseRulesPlaceholder")}
              onChange={(e) => setDetails({ ...details, houseRules: e.target.value })}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field
              label={perNight ? t("stays.card.minStayNights") : t("stays.card.minStayMonths")}
              required
            >
              <Input
                id={`min-stay-${property.id}`}
                inputMode="numeric"
                value={details.minStay}
                onChange={(e) => setDetails({ ...details, minStay: e.target.value })}
              />
            </Field>
          </div>
          <p className="text-xs text-text-secondary">
            {t("stays.card.cancellationPolicy")}
          </p>
          {detailsError ? <p className="text-sm text-danger-text">{detailsError}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={saveDetails.isPending}>
              {saveDetails.isPending ? t("stays.visitingHours.saving") : t("stays.card.saveDetails")}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setPanel(null)}>
              {t("common.cancel")}
            </Button>
          </div>
        </form>
      ) : null}

      {panel === "visits" ? (
        <div className="border-t border-line p-4">
          <VisitingHours property={property} />
        </div>
      ) : null}

      {panel === "photos" ? (
        <div className="flex flex-col gap-3 border-t border-line p-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="sr-only"
            onChange={(event) => void addPhotos(event.target.files)}
          />
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {media.map((item, index) => (
              <li
                key={item.id}
                className="relative aspect-square overflow-hidden rounded-card border border-line bg-surface-sunken"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.url} alt="" className="size-full object-cover" />
                {index === 0 ? (
                  <span className="absolute left-1.5 top-1.5 rounded-control bg-navy-900 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                    {t("stays.property.cover")}
                  </span>
                ) : null}
                <button
                  type="button"
                  className="absolute right-1.5 top-1.5 inline-flex size-7 items-center justify-center rounded-full bg-white/95 text-navy-900 shadow-xs"
                  onClick={() => removePhoto.mutate(item.id)}
                  disabled={removePhoto.isPending}
                  aria-label={t("stays.photos.remove")}
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-line-strong bg-surface-sunken text-text-secondary transition hover:border-action hover:bg-surface hover:text-navy-900"
              >
                <Camera className="size-7" />
                <span className="text-xs font-semibold">{uploading ? t("stays.photos.uploading") : t("stays.photos.add")}</span>
              </button>
            </li>
          </ul>
          <p className="text-xs text-text-secondary">{t("stays.card.photoFormats")}</p>
          {photoError ? <p className="text-sm text-danger-text">{photoError}</p> : null}
        </div>
      ) : null}
    </Card>
  );
}
