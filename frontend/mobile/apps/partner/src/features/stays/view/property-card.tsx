import { Badge, Button, Card, Dialog, Text } from "@vsolve/mobile-ui";
import { useState } from "react";
import { Image, ScrollView, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BedDouble,
  Camera,
  Clock,
  Edit3,
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
        ? "Paused. Guests can't find it or book it; existing bookings go ahead as planned."
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

  // Photos fallback: building photos first; with none, room photos stand in.
  const photoSlides: { id: string; url: string }[] =
    media.length > 0
      ? media.filter((m) => Boolean(m.url)).map((m) => ({ id: m.id, url: m.url }))
      : rooms.flatMap((unit) =>
          (unit.media ?? []).filter((m) => Boolean(m.url)).map((m) => ({ id: m.id, url: m.url })),
        );

  return (
    <>
      <Card className="overflow-hidden border border-line bg-surface p-0 shadow-sm">
        {/* Photo carousel / header */}
        <View className="relative h-48 w-full bg-surface-muted">
          {photoSlides.length > 0 ? (
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={(e) => {
                const width = e.nativeEvent.layoutMeasurement.width;
                if (width > 0) {
                  const idx = Math.round(e.nativeEvent.contentOffset.x / width);
                  setActivePhotoIndex(idx);
                }
              }}
              scrollEventThrottle={16}
            >
              {photoSlides.map((slide) => (
                <Image
                  key={slide.id}
                  source={{ uri: slide.url }}
                  className="h-48 w-full"
                  style={{ width: 360 }}
                  resizeMode="cover"
                />
              ))}
            </ScrollView>
          ) : (
            <View className="h-48 w-full items-center justify-center">
              <Text className="text-3xl">🏢</Text>
              <Text className="mt-1 text-xs text-text-muted">No photos yet</Text>
            </View>
          )}

          {/* Status badge overlay */}
          <View className="absolute right-3 top-3 z-10">
            <Badge tone={status.tone}>{status.label}</Badge>
          </View>

          {/* Carousel dots */}
          {photoSlides.length > 1 ? (
            <View className="absolute bottom-2 left-0 right-0 flex-row justify-center gap-1.5">
              {photoSlides.map((_, i) => (
                <View
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${
                    i === activePhotoIndex ? "w-4 bg-white" : "w-1.5 bg-white/60"
                  }`}
                />
              ))}
            </View>
          ) : null}
        </View>

        {/* Info Content */}
        <View className="p-4 flex-col gap-2">
          <View className="flex-col gap-1">
            <Text className="text-base font-bold text-text">{property.title}</Text>

            {property.location_text ? (
              <View className="flex-row items-center gap-1">
                <MapPin size={13} color="#71717a" />
                <Text className="text-xs text-text-muted" numberOfLines={1}>
                  {property.location_text}
                </Text>
              </View>
            ) : null}

            <Text className="text-xs text-text-secondary mt-0.5">
              {cheapest !== null
                ? `From ${formatPaise(cheapest)} ${ratePeriodSuffix(property.price_period)} · `
                : ""}
              {totalAvailableRooms} of {totalRoomUnits} rooms available
            </Text>

            {note ? <Text className="mt-1 text-xs text-text-muted">{note}</Text> : null}

            {(property.moderation_status === "REJECTED" ||
              property.moderation_status === "REMOVED") &&
            property.moderation_reason ? (
              <Text className="mt-1 text-xs text-rose-600 font-medium">
                {property.moderation_reason}
              </Text>
            ) : null}

            {actionError ? <Text className="text-xs text-rose-600">{actionError}</Text> : null}
          </View>

          {/* Lifecycle Action Buttons */}
          <View className="mt-2 flex-row flex-wrap gap-2 pt-2 border-t border-line/60">
            {canPublish ? (
              <Button
                variant="primary"
                size="sm"
                disabled={act.isPending || activeRooms.length === 0}
                onPress={() => act.mutate("publish")}
                className="h-8 px-3"
              >
                <Text className="text-xs font-bold text-white">
                  {act.isPending ? "Publishing…" : "Publish"}
                </Text>
              </Button>
            ) : null}

            {approved && property.listing_status === "LIVE" ? (
              <Button
                variant="outline"
                size="sm"
                disabled={act.isPending}
                onPress={() => setConfirmPauseOpen(true)}
                className="h-8 px-3"
              >
                <Text className="text-xs font-semibold text-text">Pause</Text>
              </Button>
            ) : null}

            {approved && property.listing_status === "PAUSED" ? (
              <Button
                variant="primary"
                size="sm"
                disabled={act.isPending}
                onPress={() => act.mutate("resume")}
                className="h-8 px-3"
              >
                <Text className="text-xs font-bold text-white">Resume</Text>
              </Button>
            ) : null}

            {!archived ? (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onPress={() => onManageRooms(property)}
                  className="h-8 flex-row items-center gap-1 px-2.5"
                >
                  <BedDouble size={13} color="#00112e" />
                  <Text className="text-xs font-semibold text-text">Rooms</Text>
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onPress={() => onEditDetails(property)}
                  className="h-8 flex-row items-center gap-1 px-2.5"
                >
                  <Edit3 size={13} color="#00112e" />
                  <Text className="text-xs font-semibold text-text">Edit Details</Text>
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onPress={() => onManagePhotos?.(property)}
                  className="h-8 flex-row items-center gap-1 px-2.5"
                >
                  <Camera size={13} color="#00112e" />
                  <Text className="text-xs font-semibold text-text">Building photos</Text>
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onPress={() => onVisitingHours(property)}
                  className="h-8 flex-row items-center gap-1 px-2.5"
                >
                  <Clock size={13} color="#00112e" />
                  <Text className="text-xs font-semibold text-text">Visiting Hours</Text>
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onPress={() => setConfirmArchiveOpen(true)}
                  className="h-8 px-2.5 ml-auto"
                >
                  <Text className="text-xs font-semibold text-rose-600">Archive</Text>
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                size="sm"
                disabled={act.isPending}
                onPress={() => act.mutate("restore")}
                className="h-8 px-3"
              >
                <Text className="text-xs font-semibold text-text">Restore</Text>
              </Button>
            )}
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
