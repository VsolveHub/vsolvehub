import { Badge, Button, Card, Dialog, Text } from "@vsolve/mobile-ui";
import { useState } from "react";
import { Image, Pressable, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  MapPin,
} from "lucide-react-native";

import {
  type StayProperty,
  type StayPropertyAction,
  formatPaise,
  ratePeriodSuffix,
  stayListingStatus,
} from "../model";
import { partnerStayPropertyAction } from "../queries";

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
        ? "Paused. Guests cannot find or book it; existing bookings go ahead as planned."
        : null;
  }
}

export function PropertyCard({
  property,
  onEditDetails,
  onManageRooms,
  onVisitingHours,
  onManagePhotos,
}: {
  property: StayProperty;
  onEditDetails: (property: StayProperty) => void;
  onManageRooms: (property: StayProperty) => void;
  onVisitingHours: (property: StayProperty) => void;
  onManagePhotos?: (property: StayProperty) => void;
}) {
  const qc = useQueryClient();
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [confirmPauseOpen, setConfirmPauseOpen] = useState(false);
  const [confirmArchiveOpen, setConfirmArchiveOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["partner-stay-properties"] });
    void qc.invalidateQueries({ queryKey: ["partner-stays"] });
  };

  const act = useMutation({
    mutationFn: (action: StayPropertyAction) => partnerStayPropertyAction(property.id, action),
    onSuccess: () => {
      setActionError(null);
      setConfirmPauseOpen(false);
      setConfirmArchiveOpen(false);
      invalidate();
    },
    onError: (err: any) => setActionError(err?.message || "Failed to perform action"),
  });

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

  const totalAvailableRooms = rooms.reduce((n, unit) => n + (unit.available_count ?? 0), 0);
  const totalRoomUnits = rooms.reduce((n, unit) => n + (unit.quantity ?? 0), 0);

  const approved = property.moderation_status === "APPROVED";
  const archived = property.listing_status === "ARCHIVED";
  const canPublish =
    !archived &&
    (property.moderation_status === "DRAFT" || property.moderation_status === "REJECTED");
  const note = statusNote(property);

  // Photos fallback: building photos first; direct image_urls second; room photos third.
  const directUrls = (property.image_urls ?? [])
    .filter(Boolean)
    .map((url, i) => ({ id: `img-${i}`, url }));

  const photoSlides: { id: string; url: string }[] =
    media.length > 0
      ? media.filter((m) => Boolean(m.url)).map((m) => ({ id: m.id, url: m.url }))
      : directUrls.length > 0
        ? directUrls
        : rooms.flatMap((unit) =>
            (unit.media ?? []).filter((m) => Boolean(m.url)).map((m) => ({ id: m.id, url: m.url })),
          );

  const currentSlide = photoSlides[activePhotoIndex] || photoSlides[0];

  const handlePrev = () => {
    if (photoSlides.length > 1) {
      setActivePhotoIndex((prev) => (prev - 1 + photoSlides.length) % photoSlides.length);
    }
  };

  const handleNext = () => {
    if (photoSlides.length > 1) {
      setActivePhotoIndex((prev) => (prev + 1) % photoSlides.length);
    }
  };

  return (
    <>
      <Card className="overflow-hidden rounded-2xl border border-line bg-surface p-0 shadow-xs mb-4">
        {/* Photo carousel / header */}
        <View className="relative h-52 w-full bg-surface-sunken">
          {currentSlide?.url ? (
            <Image
              source={{ uri: currentSlide.url }}
              className="h-52 w-full"
              resizeMode="cover"
            />
          ) : (
            <View className="h-52 w-full items-center justify-center">
              <Text className="text-3xl">🏢</Text>
              <Text className="mt-1 text-xs text-text-muted">No photos yet</Text>
            </View>
          )}

          {/* Previous / Next buttons */}
          {photoSlides.length > 1 ? (
            <>
              <Pressable
                hitSlop={8}
                onPress={handlePrev}
                accessibilityLabel="Previous photo"
                style={{ transform: [{ translateY: -16 }] }}
                className="absolute left-2.5 top-1/2 size-8 rounded-full bg-white/90 items-center justify-center shadow-xs z-20 active:bg-white"
              >
                <ChevronLeft size={16} color="#071328" strokeWidth={2.5} />
              </Pressable>

              <Pressable
                hitSlop={8}
                onPress={handleNext}
                accessibilityLabel="Next photo"
                style={{ transform: [{ translateY: -16 }] }}
                className="absolute right-2.5 top-1/2 size-8 rounded-full bg-white/90 items-center justify-center shadow-xs z-20 active:bg-white"
              >
                <ChevronRight size={16} color="#071328" strokeWidth={2.5} />
              </Pressable>

              {/* Photo counter pill */}
              <View className="absolute bottom-2.5 left-2.5 rounded-full bg-black/60 px-2.5 py-0.5 z-20">
                <Text className="text-[11px] font-semibold text-white">
                  {activePhotoIndex + 1} / {photoSlides.length}
                </Text>
              </View>
            </>
          ) : null}

          {/* Status badge overlay */}
          <View className="absolute right-2.5 top-2.5 z-20">
            {property.listing_status === "PAUSED" ? (
              <View className="rounded-full bg-black/60 px-2.5 py-1">
                <Text className="text-xs font-semibold text-white">
                  Paused — hidden from guests
                </Text>
              </View>
            ) : property.listing_status === "LIVE" ? (
              <View className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1">
                <Text className="text-xs font-semibold text-emerald-700">Live</Text>
              </View>
            ) : (
              <Badge tone={status.tone}>{status.label}</Badge>
            )}
          </View>
        </View>

        {/* Info Content */}
        <View className="p-4 flex-col gap-2">
          <View className="flex-col gap-1">
            <Text className="text-base font-bold text-navy-900">{property.title}</Text>

            {property.location_text ? (
              <View className="flex-row items-center gap-1">
                <MapPin size={13} color="#71717a" />
                <Text className="text-xs text-text-secondary font-medium" numberOfLines={1}>
                  {property.location_text}
                </Text>
              </View>
            ) : null}

            <Text className="text-xs text-text-secondary mt-0.5 font-medium">
              {cheapest !== null
                ? `From ${formatPaise(cheapest)} ${ratePeriodSuffix(property.price_period)} · `
                : ""}
              {totalAvailableRooms} of {totalRoomUnits} rooms available
            </Text>

            {note ? (
              <Text className="mt-0.5 text-xs text-text-secondary leading-relaxed">{note}</Text>
            ) : null}

            {(property.moderation_status === "REJECTED" ||
              property.moderation_status === "REMOVED") &&
            property.moderation_reason ? (
              <Text className="mt-1 text-xs text-rose-600 font-medium">
                {property.moderation_reason}
              </Text>
            ) : null}

            {actionError ? <Text className="text-xs text-rose-600">{actionError}</Text> : null}
          </View>

          {/* Action Buttons */}
          <View className="mt-2 flex-col gap-2 pt-2 border-t border-line/60">
            {/* Row 1: Resume/Pause, Rooms, Edit details */}
            <View className="flex-row flex-wrap gap-2">
              {canPublish ? (
                <Pressable
                  disabled={act.isPending || activeRooms.length === 0}
                  onPress={() => act.mutate("publish")}
                  className="rounded-xl bg-[#f87000] px-4 py-2 items-center justify-center active:opacity-90 shadow-xs"
                >
                  <Text className="text-xs font-bold text-white">
                    {act.isPending ? "Publishing…" : "Publish"}
                  </Text>
                </Pressable>
              ) : null}

              {approved && property.listing_status === "LIVE" ? (
                <Pressable
                  disabled={act.isPending}
                  onPress={() => setConfirmPauseOpen(true)}
                  className="rounded-xl border border-line bg-surface px-4 py-2 items-center justify-center active:bg-surface-hover shadow-xs"
                >
                  <Text className="text-xs font-semibold text-navy-900">Pause</Text>
                </Pressable>
              ) : null}

              {approved && property.listing_status === "PAUSED" ? (
                <Pressable
                  disabled={act.isPending}
                  onPress={() => act.mutate("resume")}
                  className="rounded-xl bg-[#f87000] px-4 py-2 items-center justify-center active:opacity-90 shadow-xs"
                >
                  <Text className="text-xs font-bold text-white">Resume</Text>
                </Pressable>
              ) : null}

              {!archived ? (
                <>
                  <Pressable
                    onPress={() => onManageRooms(property)}
                    className="rounded-xl border border-line bg-surface px-4 py-2 items-center justify-center active:bg-surface-hover shadow-xs"
                  >
                    <Text className="text-xs font-semibold text-navy-900">Rooms</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => onEditDetails(property)}
                    className="rounded-xl border border-line bg-surface px-4 py-2 items-center justify-center active:bg-surface-hover shadow-xs"
                  >
                    <Text className="text-xs font-semibold text-navy-900">Edit details</Text>
                  </Pressable>
                </>
              ) : (
                <Pressable
                  disabled={act.isPending}
                  onPress={() => act.mutate("restore")}
                  className="rounded-xl border border-line bg-surface px-4 py-2 items-center justify-center active:bg-surface-hover shadow-xs"
                >
                  <Text className="text-xs font-semibold text-navy-900">Restore</Text>
                </Pressable>
              )}
            </View>

            {/* Row 2: Building photos, Visiting hours */}
            {!archived ? (
              <View className="flex-row flex-wrap gap-2">
                <Pressable
                  onPress={() => onManagePhotos?.(property)}
                  className="rounded-xl border border-line bg-surface px-4 py-2 items-center justify-center active:bg-surface-hover shadow-xs"
                >
                  <Text className="text-xs font-semibold text-navy-900">Building photos</Text>
                </Pressable>

                <Pressable
                  onPress={() => onVisitingHours(property)}
                  className="rounded-xl border border-line bg-surface px-4 py-2 items-center justify-center active:bg-surface-hover shadow-xs"
                >
                  <Text className="text-xs font-semibold text-navy-900">Visiting hours</Text>
                </Pressable>
              </View>
            ) : null}

            {/* Row 3: Archive */}
            {!archived ? (
              <Pressable
                onPress={() => setConfirmArchiveOpen(true)}
                className="self-start pt-1"
              >
                <Text className="text-xs font-semibold text-text-muted active:text-text">
                  Archive
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </Card>


      {/* Two-step confirm: Pause */}
      <Dialog
        open={confirmPauseOpen}
        onOpenChange={setConfirmPauseOpen}
        title="Pause this stay?"
        description="Guests won't be able to find or book this property while paused. Existing bookings continue normally."
      >
        <View className="flex-row justify-end gap-2 pt-3">
          <Button variant="ghost" size="sm" onPress={() => setConfirmPauseOpen(false)}>
            <Text className="text-xs font-semibold text-text">Keep Live</Text>
          </Button>
          <Button
            variant="primary"
            size="sm"
            onPress={() => act.mutate("pause")}
            disabled={act.isPending}
          >
            <Text className="text-xs font-bold text-white">
              {act.isPending ? "Pausing…" : "Pause Listing"}
            </Text>
          </Button>
        </View>
      </Dialog>

      {/* Two-step confirm: Archive */}
      <Dialog
        open={confirmArchiveOpen}
        onOpenChange={setConfirmArchiveOpen}
        title="Archive this property?"
        description="Archiving hides the property from all guests. You can restore it later from your archived properties."
      >
        <View className="flex-row justify-end gap-2 pt-3">
          <Button variant="ghost" size="sm" onPress={() => setConfirmArchiveOpen(false)}>
            <Text className="text-xs font-semibold text-text">Cancel</Text>
          </Button>
          <Button
            variant="primary"
            size="sm"
            onPress={() => act.mutate("archive")}
            disabled={act.isPending}
          >
            <Text className="text-xs font-bold text-white">
              {act.isPending ? "Archiving…" : "Archive"}
            </Text>
          </Button>
        </View>
      </Dialog>
    </>
  );
}
