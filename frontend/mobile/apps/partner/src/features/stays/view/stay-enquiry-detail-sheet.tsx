import { Button, Dialog, Input, Text } from "@vsolve/mobile-ui";
import { useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, View } from "react-native";
import { CheckCircle2, Phone, User } from "lucide-react-native";

import {
  type StayEnquiry,
  formatPaise,
  getEnquiryStatusBadge,
  stayLengthLabel,
} from "../model";
import { useBookableRooms } from "./use-bookable-rooms";

const OPEN_STATUSES = new Set(["SUBMITTED", "RESPONDED", "OPEN"]);

export function StayEnquiryDetailSheet({
  enquiry,
  open,
  onOpenChange,
  onBooked,
  onNotAvailable,
  onCancelBooking,
  isPending,
  actionError,
}: {
  enquiry: StayEnquiry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBooked: (id: string, roomId: string | null) => void;
  onNotAvailable: (id: string, note: string) => void;
  onCancelBooking: (id: string) => void;
  isPending: boolean;
  actionError?: string | null;
}) {
  const [declining, setDeclining] = useState(false);
  const [booking, setBooking] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [roomId, setRoomId] = useState("");
  const [note, setNote] = useState("");

  const rooms = useBookableRooms(enquiry?.property?.id, enquiry?.unit?.id);

  useEffect(() => {
    queueMicrotask(() => {
      setDeclining(false);
      setBooking(false);
      setCancelConfirmOpen(false);
      setNote("");
    });
  }, [enquiry?.id, open]);

  useEffect(() => {
    if (booking && rooms.length > 0 && !rooms.some((r) => r.id === roomId)) {
      setRoomId(rooms[0]?.id ?? "");
    }
  }, [booking, rooms, roomId]);

  if (!enquiry) return null;

  const status = (enquiry.status ?? "").toUpperCase();
  const isOpen = OPEN_STATUSES.has(status);
  const badge = getEnquiryStatusBadge(enquiry.status);

  const durationStr = enquiry.stay_length
    ? stayLengthLabel(enquiry.stay_length, enquiry.price_period)
    : stayLengthLabel(enquiry.length ?? 1, enquiry.price_period);

  const handleCall = () => {
    if (enquiry.user_phone) {
      void Linking.openURL(`tel:${enquiry.user_phone}`);
    }
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        title={enquiry.user_name || "Guest enquiry"}
        description={`${badge.label} · ${enquiry.property?.title || enquiry.property_title || "Stay"} · ${enquiry.unit?.name || enquiry.unit_name || "Room"}`}
      >
        <ScrollView className="max-h-[75vh]" showsVerticalScrollIndicator={false}>
          <View className="flex-col gap-4 py-2">
            {actionError ? (
              <View className="rounded-lg bg-rose-50 p-2.5">
                <Text className="text-xs text-rose-600 font-medium">{actionError}</Text>
              </View>
            ) : null}

            {/* Guest Section */}
            <View className="flex-col gap-2 rounded-xl border border-line bg-surface-muted p-3">
              <Text className="text-xs font-bold uppercase tracking-wider text-text-muted">
                Guest Contact
              </Text>
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-2">
                  <User size={15} color="#71717a" />
                  <Text className="text-sm font-semibold text-text">
                    {enquiry.user_name || "Prospective Tenant"}
                  </Text>
                </View>
                {enquiry.user_phone ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onPress={handleCall}
                    className="h-7 flex-row items-center gap-1.5 px-2.5"
                  >
                    <Phone size={12} color="#f87000" />
                    <Text className="text-xs font-semibold text-[#f87000]">Call</Text>
                  </Button>
                ) : null}
              </View>
              {isOpen ? (
                <Text className="text-[11px] text-text-muted">
                  Call to agree on room details, dates, and token payment, then record the outcome below.
                </Text>
              ) : null}
            </View>

            {/* Stay Request Details */}
            <View className="flex-col gap-2 rounded-xl border border-line bg-surface p-3">
              <Text className="text-xs font-bold uppercase tracking-wider text-text-muted">
                Wants to Stay
              </Text>

              <View className="flex-row items-center justify-between py-1 border-b border-line/50">
                <Text className="text-xs text-text-muted">Move-in date</Text>
                <Text className="text-xs font-semibold text-text">{enquiry.check_in}</Text>
              </View>

              <View className="flex-row items-center justify-between py-1 border-b border-line/50">
                <Text className="text-xs text-text-muted">Duration</Text>
                <Text className="text-xs font-semibold text-text">{durationStr}</Text>
              </View>

              <View className="flex-row items-center justify-between py-1 border-b border-line/50">
                <Text className="text-xs text-text-muted">Guests</Text>
                <Text className="text-xs font-semibold text-text">
                  {enquiry.adult_count !== undefined
                    ? `${enquiry.adult_count} adult${enquiry.adult_count === 1 ? "" : "s"}${enquiry.child_count ? `, ${enquiry.child_count} child` : ""}`
                    : `${enquiry.guest_count ?? 1} guest${(enquiry.guest_count ?? 1) === 1 ? "" : "s"}`}
                </Text>
              </View>

              <View className="flex-row items-center justify-between py-1 border-b border-line/50">
                <Text className="text-xs text-text-muted">Room unit</Text>
                <Text className="text-xs font-semibold text-text">
                  {enquiry.unit?.name || enquiry.unit_name || "Standard Room"}
                </Text>
              </View>

              {enquiry.total_quote_paise ? (
                <View className="flex-row items-center justify-between py-1">
                  <Text className="text-xs text-text-muted">Estimated quote</Text>
                  <Text className="text-sm font-bold text-[#f87000]">
                    {formatPaise(enquiry.total_quote_paise)}
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Message from Guest */}
            {enquiry.message ? (
              <View className="flex-col gap-1.5 rounded-xl border border-line bg-surface p-3">
                <Text className="text-xs font-bold uppercase tracking-wider text-text-muted">
                  Message from guest
                </Text>
                <Text className="text-xs text-text">{enquiry.message}</Text>
              </View>
            ) : null}

            {/* Host Note if already responded */}
            {enquiry.host_response && !isOpen ? (
              <View className="flex-col gap-1.5 rounded-xl border border-line bg-surface-muted p-3">
                <Text className="text-xs font-bold uppercase tracking-wider text-text-muted">
                  Your Response
                </Text>
                <Text className="text-xs text-text">{enquiry.host_response}</Text>
              </View>
            ) : null}

            {/* Booking Confirmed Selector Sub-View */}
            {booking && isOpen ? (
              <View className="flex-col gap-3 rounded-xl border border-line bg-surface-muted p-3">
                <Text className="text-sm font-bold text-text">Select Booked Room</Text>
                <Text className="text-xs text-text-muted">
                  The room is marked Booked and stops appearing as available. The guest is told.
                </Text>

                {rooms.length === 0 ? (
                  <Text className="text-xs text-text-secondary font-medium">
                    Every room is already marked booked. The booking will still be recorded.
                  </Text>
                ) : (
                  <View className="flex-col gap-1.5">
                    {rooms.map((room) => {
                      const isSelected = room.id === roomId;
                      return (
                        <Pressable
                          key={room.id}
                          onPress={() => setRoomId(room.id)}
                          className={`rounded-lg border p-2.5 flex-row items-center justify-between ${
                            isSelected
                              ? "border-[#071328] bg-surface shadow-xs"
                              : "border-line bg-surface/60"
                          }`}
                        >
                          <Text
                            className={`text-xs ${isSelected ? "font-bold text-[#071328]" : "text-text"}`}
                          >
                            {room.label}
                          </Text>
                          {isSelected ? <CheckCircle2 size={14} color="#071328" /> : null}
                        </Pressable>
                      );
                    })}
                  </View>
                )}

                <View className="flex-row justify-end gap-2 pt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isPending}
                    onPress={() => setBooking(false)}
                  >
                    <Text className="text-xs font-semibold text-text">Not yet</Text>
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={isPending}
                    onPress={() => onBooked(enquiry.id, roomId || null)}
                  >
                    <Text className="text-xs font-bold text-white">
                      {isPending ? "Saving…" : "Yes – Mark Room Booked"}
                    </Text>
                  </Button>
                </View>
              </View>
            ) : null}

            {/* Not Available Sub-View */}
            {declining ? (
              <View className="flex-col gap-2 rounded-xl border border-line bg-surface-muted p-3">
                <Text className="text-sm font-bold text-text">Not Available</Text>
                <Text className="text-xs text-text-muted">
                  Note for the guest (e.g. The room is taken until March).
                </Text>
                <Input
                  value={note}
                  onChangeText={setNote}
                  placeholder="e.g. Sorry, all beds are occupied."
                  multiline
                  numberOfLines={2}
                  className="min-h-[3.5rem] py-2 text-xs"
                />
                <View className="flex-row justify-end gap-2 pt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isPending}
                    onPress={() => setDeclining(false)}
                  >
                    <Text className="text-xs font-semibold text-text">Back</Text>
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={isPending}
                    onPress={() => onNotAvailable(enquiry.id, note.trim())}
                  >
                    <Text className="text-xs font-bold text-white">
                      {isPending ? "Sending…" : "Tell the guest"}
                    </Text>
                  </Button>
                </View>
              </View>
            ) : null}

            {/* Bottom Actions */}
            {!booking && !declining ? (
              <View className="flex-row flex-wrap items-center justify-end gap-2 pt-2 border-t border-line">
                {isOpen ? (
                  <>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={isPending}
                      onPress={() => setDeclining(true)}
                      className="h-8 px-3"
                    >
                      <Text className="text-xs font-semibold text-text">Not available</Text>
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={isPending}
                      onPress={() => setBooking(true)}
                      className="h-8 px-3"
                    >
                      <Text className="text-xs font-bold text-white">Mark as Booked</Text>
                    </Button>
                  </>
                ) : status === "CONFIRMED" ? (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onPress={() => onOpenChange(false)}
                      className="h-8 px-3"
                    >
                      <Text className="text-xs text-text-muted">Close</Text>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isPending}
                      onPress={() => setCancelConfirmOpen(true)}
                      className="h-8 px-3"
                    >
                      <Text className="text-xs font-semibold text-rose-600">Cancel booking</Text>
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onPress={() => onOpenChange(false)}
                    className="h-8 px-3"
                  >
                    <Text className="text-xs font-semibold text-text">Close</Text>
                  </Button>
                )}
              </View>
            ) : null}
          </View>
        </ScrollView>
      </Dialog>

      {/* Two-step cancel booking dialog */}
      <Dialog
        open={cancelConfirmOpen}
        onOpenChange={setCancelConfirmOpen}
        title="Cancel this booking?"
        description="The guest's booking record will be cancelled and the room marked available again."
      >
        <View className="flex-row justify-end gap-2 pt-3">
          <Button variant="ghost" size="sm" onPress={() => setCancelConfirmOpen(false)}>
            <Text className="text-xs font-semibold text-text">Keep Booking</Text>
          </Button>
          <Button
            variant="primary"
            size="sm"
            onPress={() => {
              setCancelConfirmOpen(false);
              onCancelBooking(enquiry.id);
            }}
          >
            <Text className="text-xs font-bold text-white">Yes – Cancel Booking</Text>
          </Button>
        </View>
      </Dialog>
    </>
  );
}
