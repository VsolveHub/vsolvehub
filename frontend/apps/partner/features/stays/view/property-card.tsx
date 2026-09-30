"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { friendlyErrorMessage } from "@vsolve/query";
import { Badge, Button, Card, Field, Input, Textarea, formatMoney } from "@vsolve/ui";
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
import { SchemaQuestions } from "./schema-questions";
import { answersFrom, collectSchemaAnswers, wholeNumber } from "./stay-form-helpers";

type Panel = "rooms" | "details" | "photos" | null;

type DetailsDraft = {
  title: string;
  location: string;
  description: string;
  houseRules: string;
  minStay: string;
  openFrom: string;
  openUntil: string;
  answers: Record<string, string>;
};

function detailsFrom(property: StayProperty): DetailsDraft {
  return {
    title: property.title,
    location: property.location_text ?? "",
    description: property.description ?? "",
    houseRules: property.house_rules ?? "",
    minStay: String(property.min_stay_nights ?? 1),
    openFrom: property.available_from ?? "",
    openUntil: property.available_until ?? "",
    answers: answersFrom(property.structured_fields),
  };
}

/** What the host sees about where the property stands and what they can do next. */
function statusNote(property: StayProperty): string | null {
  const activeRooms = (property.units ?? []).filter((unit) => unit.is_active !== false).length;
  if (property.listing_status === "ARCHIVED") {
    return "Archived. Guests can't see it. Restore it to bring it back.";
  }
  switch (property.moderation_status) {
    case "DRAFT":
      return activeRooms > 0
        ? "Ready when you are — publish to show it to guests."
        : "Add at least one room, then publish.";
    case "PENDING":
      return "Guests pay upfront for this property, so our team checks your first paid-booking listing once. After that, your listings go live straight away.";
    case "REJECTED":
      return "Fix what our team asked for, then publish again.";
    case "REMOVED":
      return "Removed by VSolve. Contact support if you think this is a mistake.";
    default:
      return property.listing_status === "PAUSED"
        ? "Paused. Guests can't find it or book it; existing bookings go ahead as planned."
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
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [panel, setPanel] = useState<Panel>(initialPanel);
  const [details, setDetails] = useState<DetailsDraft>(() => detailsFrom(property));
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["partner-stays"] });
  const status = stayListingStatus(property);
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
  const unitWord = property.price_period === "NIGHT" ? "night" : "month";
  const archived = property.listing_status === "ARCHIVED";
  const canPublish =
    !archived &&
    (property.moderation_status === "DRAFT" || property.moderation_status === "REJECTED");
  const note = statusNote(property);

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
    setUploading(true);
    setPhotoError(null);
    try {
      let order = media.length;
      for (const file of Array.from(files)) {
        const uploaded = await uploadPartnerStayPhoto(file);
        await addPartnerStayPropertyMedia(property.id, { url: uploaded.url, display_order: order });
        order += 1;
      }
      invalidate();
    } catch (err) {
      setPhotoError(friendlyErrorMessage(err, "Could not add this photo."));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function onSaveDetails(event: FormEvent) {
    event.preventDefault();
    if (!details.title.trim()) return setDetailsError("The property needs a name.");
    if (!details.location.trim()) return setDetailsError("The property needs a location.");
    const minStay = wholeNumber(details.minStay);
    if (minStay === null) return setDetailsError(`Minimum stay must be 1 ${unitWord} or more.`);
    if (details.openFrom && details.openUntil && details.openUntil < details.openFrom) {
      return setDetailsError("“Open until” must be on or after “open from”.");
    }
    const collected = collectSchemaAnswers(variant?.property_schema, details.answers);
    if ("missing" in collected) return setDetailsError(`Choose ${collected.missing}.`);
    setDetailsError(null);
    saveDetails.mutate({
      title: details.title.trim(),
      location_text: details.location.trim(),
      description: details.description.trim(),
      house_rules: details.houseRules.trim(),
      min_stay_nights: minStay,
      available_from: details.openFrom || null,
      available_until: details.openUntil || null,
      structured_fields: collected.values,
    });
  }

  function toggle(next: Exclude<Panel, null>) {
    if (next === "details") setDetails(detailsFrom(property));
    setPanel((current) => (current === next ? null : next));
  }

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="grid gap-0 sm:grid-cols-[minmax(0,240px)_1fr]">
        <div className="relative aspect-[4/3] bg-surface-sunken sm:aspect-auto sm:min-h-[180px]">
          <PropertyPhotoCarousel
            fill
            label={property.title}
            slides={media
              .filter((item) => Boolean(item.url))
              .map((item) => ({ id: item.id, url: item.url, caption: item.caption || property.title }))}
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
                ? `From ${formatMoney(cheapest)} ${ratePeriodSuffix(property.price_period)} · `
                : ""}
              {activeRooms.length} room type{activeRooms.length === 1 ? "" : "s"} open for booking
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
                {act.isPending ? "Publishing…" : "Publish"}
              </Button>
            ) : null}
            {approved && property.listing_status === "LIVE" ? (
              <Button
                size="sm"
                variant="outline"
                disabled={act.isPending}
                onClick={() => act.mutate("pause")}
              >
                Pause
              </Button>
            ) : null}
            {approved && property.listing_status === "PAUSED" ? (
              <Button size="sm" disabled={act.isPending} onClick={() => act.mutate("resume")}>
                Resume
              </Button>
            ) : null}
            {!archived ? (
              <>
                <Button
                  size="sm"
                  variant={panel === "rooms" ? "secondary" : "outline"}
                  onClick={() => toggle("rooms")}
                >
                  Rooms
                </Button>
                <Button
                  size="sm"
                  variant={panel === "details" ? "secondary" : "outline"}
                  onClick={() => toggle("details")}
                >
                  Edit details
                </Button>
                <Button
                  size="sm"
                  variant={panel === "photos" ? "secondary" : "outline"}
                  onClick={() => toggle("photos")}
                >
                  Photos
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={act.isPending}
                  onClick={() => act.mutate("archive")}
                >
                  Archive
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled={act.isPending}
                onClick={() => act.mutate("restore")}
              >
                Restore
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
            <Field label="Property name" required>
              <Input
                id={`title-${property.id}`}
                value={details.title}
                maxLength={180}
                onChange={(e) => setDetails({ ...details, title: e.target.value })}
              />
            </Field>
            <Field label="Location" required>
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
          <Field label="Description" showOptional>
            <Textarea
              id={`description-${property.id}`}
              value={details.description}
              onChange={(e) => setDetails({ ...details, description: e.target.value })}
            />
          </Field>
          <Field label="House rules" showOptional>
            <Textarea
              id={`rules-${property.id}`}
              value={details.houseRules}
              placeholder="Gate time, visitors, smoking, quiet hours."
              onChange={(e) => setDetails({ ...details, houseRules: e.target.value })}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={`Minimum stay (${unitWord}s)`} required>
              <Input
                id={`min-stay-${property.id}`}
                inputMode="numeric"
                value={details.minStay}
                onChange={(e) => setDetails({ ...details, minStay: e.target.value })}
              />
            </Field>
            <Field
              label="Open for bookings from"
              showOptional
              description="Leave empty to take bookings any time."
            >
              <Input
                id={`open-from-${property.id}`}
                type="date"
                value={details.openFrom}
                onChange={(e) => setDetails({ ...details, openFrom: e.target.value })}
              />
            </Field>
            <Field label="Open for bookings until" showOptional>
              <Input
                id={`open-until-${property.id}`}
                type="date"
                value={details.openUntil}
                onChange={(e) => setDetails({ ...details, openUntil: e.target.value })}
              />
            </Field>
          </div>
          <p className="text-xs text-text-secondary">
            Cancellations follow the VSolve policy, so guests see the same rules everywhere.
          </p>
          {detailsError ? <p className="text-sm text-danger-text">{detailsError}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={saveDetails.isPending}>
              {saveDetails.isPending ? "Saving…" : "Save details"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setPanel(null)}>
              Cancel
            </Button>
          </div>
        </form>
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
                    Cover
                  </span>
                ) : null}
                <button
                  type="button"
                  className="absolute right-1.5 top-1.5 inline-flex size-7 items-center justify-center rounded-full bg-white/95 text-navy-900 shadow-xs"
                  onClick={() => removePhoto.mutate(item.id)}
                  disabled={removePhoto.isPending}
                  aria-label="Remove photo"
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
                <span className="text-xs font-semibold">{uploading ? "Uploading…" : "Add photo"}</span>
              </button>
            </li>
          </ul>
          {photoError ? <p className="text-sm text-danger-text">{photoError}</p> : null}
        </div>
      ) : null}
    </Card>
  );
}
