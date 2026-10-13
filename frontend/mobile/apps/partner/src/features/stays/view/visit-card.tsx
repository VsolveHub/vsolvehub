import { Badge, Button, Card, Dialog, Input, Text } from "@vsolve/mobile-ui";
import { useState } from "react";
import { Linking, Pressable, ScrollView, View } from "react-native";
import { CheckCircle2, Phone } from "lucide-react-native";

import {
  type PartnerStayVisit,
  type VisitDeclineReason,
  VISIT_DECLINE_REASONS,
  getVisitStatusBadge,
} from "../model";
import { useBookableRooms } from "./use-bookable-rooms";

export function VisitCard({
  visit,
  onAccept,
  onDecline,
  onBookRoom,
}: {
  visit: PartnerStayVisit;
  onAccept: (visit: PartnerStayVisit) => void;
  onDecline: (visit: PartnerStayVisit, reason?: VisitDeclineReason, note?: string) => void;
  onBookRoom?: (visit: PartnerStayVisit, roomId: string) => void;
}) {
  const badge = getVisitStatusBadge(visit.status);
  const status = (visit.status ?? "").toUpperCase();
  const isRequested = status === "REQUESTED";
  const isAccepted = status === "ACCEPTED";

  // Decline Dialog
  const [declineDialogOpen, setDeclineDialogOpen] = useState(false);
  const [selectedReason, setSelectedReason] = useState<VisitDeclineReason | "">("");
  const [declineNote, setDeclineNote] = useState("");

  // Book Room Dialog
  const [bookDialogOpen, setBookDialogOpen] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState("");

  const rooms = useBookableRooms(visit.property?.id);

  const handleCall = () => {
    if (visit.customer_phone) {
      void Linking.openURL(`tel:${visit.customer_phone}`);
    }
  };

  const handleOpenBook = () => {
    if (rooms.length > 0) {
      setSelectedRoomId(rooms[0]?.id ?? "");
    }
    setBookDialogOpen(true);
  };

  return (
    <>
      <Card className="border border-line bg-surface p-4 shadow-sm">
        <View className="flex-row items-center justify-between border-b border-line/60 pb-3">
          <View className="flex-1 pr-2">
            <Text className="text-base font-bold text-text" numberOfLines={1}>
              {visit.customer_name || "Guest"}
            </Text>
            {visit.unit_name ? (
              <Text className="text-xs text-text-muted">Interested in: {visit.unit_name}</Text>
            ) : (
              <Text className="text-xs text-text-muted">In-person Tour</Text>
            )}
          </View>
          <Badge tone={badge.tone}>{badge.label}</Badge>
        </View>

        <View className="mt-3 flex-col gap-2">
          {visit.customer_phone ? (
            <View className="flex-row items-center justify-between">
              <Text className="text-xs text-text-secondary">{visit.customer_phone}</Text>
              {isRequested || isAccepted ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onPress={handleCall}
                  className="h-7 flex-row items-center gap-1.5 px-2.5"
                >
                  <Phone size={12} color="#f87000" />
                  <Text className="text-xs font-semibold text-action">Call</Text>
                </Button>
              ) : null}
            </View>
          ) : null}

          {visit.message ? (
            <View className="rounded-lg bg-surface-muted p-2">
              <Text className="text-xs text-text-muted">&ldquo;{visit.message}&rdquo;</Text>
            </View>
          ) : null}

          {status === "DECLINED" && (visit.reason || visit.note) ? (
            <View className="mt-1 rounded-lg bg-rose-50 p-2">
              <Text className="text-xs text-rose-700">
                Reason given: {visit.reason ? visit.reason.replace(/_/g, " ").toLowerCase() : ""}
                {visit.note ? ` — ${visit.note}` : ""}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Action Buttons */}
        <View className="mt-3 flex-row flex-wrap items-center justify-end gap-2 border-t border-line/60 pt-3">
          {isRequested ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onPress={() => setDeclineDialogOpen(true)}
                className="h-8 px-3"
              >
                <Text className="text-xs font-semibold text-rose-600">Decline</Text>
              </Button>

              <Button
                variant="primary"
                size="sm"
                onPress={() => onAccept(visit)}
                className="h-8 flex-row items-center gap-1.5 px-3"
              >
                <CheckCircle2 size={13} color="#ffffff" />
                <Text className="text-xs font-bold text-white">Accept</Text>
              </Button>
            </>
          ) : isAccepted ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onPress={() => setDeclineDialogOpen(true)}
                className="h-8 px-3"
              >
                <Text className="text-xs font-semibold text-text-muted">Cancel visit</Text>
              </Button>

              <Button
                variant="primary"
                size="sm"
                onPress={handleOpenBook}
                className="h-8 flex-row items-center gap-1.5 px-3"
              >
                <CheckCircle2 size={13} color="#ffffff" />
                <Text className="text-xs font-bold text-white">Mark as Booked</Text>
              </Button>
            </>
          ) : null}
        </View>
      </Card>

      {/* Decline Visit Dialog */}
      <Dialog
        open={declineDialogOpen}
        onOpenChange={setDeclineDialogOpen}
        title={isAccepted ? "Cancel this scheduled visit?" : "Decline this visit?"}
        description="The guest is told “The owner has not accepted your visit”. A reason is optional."
      >
        <ScrollView className="max-h-[60vh]" showsVerticalScrollIndicator={false}>
          <View className="py-2 flex-col gap-3">
            <Text className="text-xs font-semibold text-text">Reason (optional)</Text>
            <View className="flex-col gap-1.5">
              {VISIT_DECLINE_REASONS.map((r) => {
                const isSelected = selectedReason === r.value;
                return (
                  <Pressable
                    key={r.value}
                    onPress={() => setSelectedReason(r.value)}
                    className={`rounded-lg border p-2.5 ${
                      isSelected
                        ? "border-navy-900 bg-surface-muted"
                        : "border-line bg-surface"
                    }`}
                  >
                    <Text className={`text-xs ${isSelected ? "font-bold text-navy-900" : "text-text"}`}>
                      {r.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View className="mt-2">
              <Text className="text-xs font-semibold text-text">Note for the guest (Optional)</Text>
              <Input
                value={declineNote}
                onChangeText={setDeclineNote}
                placeholder="e.g. Please pick another weekday."
                multiline
                numberOfLines={2}
                className="mt-1.5 min-h-[3.5rem] py-2 text-xs"
              />
            </View>

            <View className="flex-row justify-end gap-2 pt-3">
              <Button variant="ghost" size="sm" onPress={() => setDeclineDialogOpen(false)}>
                <Text className="text-xs font-semibold text-text">Back</Text>
              </Button>
              <Button
                variant="primary"
                size="sm"
                onPress={() => {
                  setDeclineDialogOpen(false);
                  onDecline(visit, selectedReason || undefined, declineNote.trim() || undefined);
                }}
              >
                <Text className="text-xs font-bold text-white">
                  {isAccepted ? "Cancel Visit" : "Decline Visit"}
                </Text>
              </Button>
            </View>
          </View>
        </ScrollView>
      </Dialog>

      {/* Mark as Booked Room Selection Dialog */}
      <Dialog
        open={bookDialogOpen}
        onOpenChange={setBookDialogOpen}
        title="Booking confirmed?"
        description={`${visit.customer_name || "The guest"} is taking a room. It will show as Booked and stop appearing as available.`}
      >
        <View className="py-2 flex-col gap-3">
          <Text className="text-xs font-semibold text-text">Which room?</Text>
          {rooms.length === 0 ? (
            <Text className="text-xs text-text-muted">
              Every room is already marked booked.
            </Text>
          ) : (
            <View className="flex-col gap-1.5">
              {rooms.map((r) => {
                const on = r.id === selectedRoomId;
                return (
                  <Pressable
                    key={r.id}
                    onPress={() => setSelectedRoomId(r.id)}
                    className={`rounded-lg border p-2.5 flex-row items-center justify-between ${
                      on ? "border-navy-900 bg-surface-muted" : "border-line bg-surface"
                    }`}
                  >
                    <Text className={`text-xs ${on ? "font-bold text-navy-900" : "text-text"}`}>
                      {r.label}
                    </Text>
                    {on ? <CheckCircle2 size={13} color="#00112e" /> : null}
                  </Pressable>
                );
              })}
            </View>
          )}

          <View className="flex-row justify-end gap-2 pt-3">
            <Button variant="ghost" size="sm" onPress={() => setBookDialogOpen(false)}>
              <Text className="text-xs font-semibold text-text">Not yet</Text>
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={rooms.length === 0}
              onPress={() => {
                setBookDialogOpen(false);
                if (onBookRoom && (selectedRoomId || rooms[0]?.id)) {
                  onBookRoom(visit, selectedRoomId || rooms[0]!.id);
                }
              }}
            >
              <Text className="text-xs font-bold text-white">Yes – Mark Room Booked</Text>
            </Button>
          </View>
        </View>
      </Dialog>
    </>
  );
}
