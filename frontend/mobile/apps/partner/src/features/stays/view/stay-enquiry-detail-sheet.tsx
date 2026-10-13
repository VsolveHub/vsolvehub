import {
  Badge,
  Button,
  Dialog,
  Input,
  Text,
} from "@vsolve/mobile-ui";
import { Linking, Pressable, ScrollView, View } from "react-native";
import {
  Calendar,
  CheckCircle2,
  Clock,
  Home,
  MessageSquare,
  Phone,
  User,
} from "lucide-react-native";
import { useState } from "react";

import {
  type StayEnquiry,
  getEnquiryStatusBadge,
  stayLengthLabel,
} from "../model";
import { useBookableRooms, type BookableRoomOption } from "./use-bookable-rooms";

const OPEN_STATUSES = new Set(["SUBMITTED", "RESPONDED"]);

export function StayEnquiryDetailSheet(props: {
  enquiry: StayEnquiry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBooked: (id: string, roomId: string | null) => void;
  onNotAvailable: (id: string, note: string) => void;
  onCancelBooking: (id: string) => void;
  isPending: boolean;
  actionError?: string | null;
}) {
  const { enquiry, open, onOpenChange } = props;
  if (!enquiry) return null;

  const badge = getEnquiryStatusBadge(enquiry.status);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={enquiry.customer_name || "Guest enquiry"}
      description={`${badge.label} · ${enquiry.property?.title || enquiry.property_title || "Stay"} · ${enquiry.unit?.name || enquiry.unit_name || "Room"}`}
    >
      {open ? (
        <StayEnquiryDetailSheetContent
          key={enquiry.id}
          {...props}
          enquiry={enquiry}
        />
      ) : null}
    </Dialog>
  );
}

function StayEnquiryDetailSheetContent({
  enquiry,
  onOpenChange,
  onBooked,
  onNotAvailable,
  onCancelBooking,
  isPending,
  actionError,
}: {
  enquiry: StayEnquiry;
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

  const rooms = useBookableRooms(enquiry.property?.id, enquiry.unit?.id);
  const effectiveRoomId =
    roomId && rooms.some((r: BookableRoomOption) => r.id === roomId)
      ? roomId
      : (rooms[0]?.id ?? "");

  const status = (enquiry.status ?? "").toUpperCase();
  const isOpen = OPEN_STATUSES.has(status);
  const badge = getEnquiryStatusBadge(enquiry.status);

  const durationStr = enquiry.stay_length
    ? stayLengthLabel(enquiry.stay_length, enquiry.price_period)
    : stayLengthLabel(enquiry.length ?? 1, enquiry.price_period);

  const handleCall = () => {
    if (enquiry.customer_phone) {
      void Linking.openURL(`tel:${enquiry.customer_phone}`);
    }
  };

  return (
    <>
      <ScrollView className="max-h-[75vh]" showsVerticalScrollIndicator={false}>
        <View className="flex-col gap-4 py-2">
          {actionError ? (
            <View className="rounded-lg bg-rose-50 p-2.5">
              <Text className="text-xs text-rose-700">{actionError}</Text>
            </View>
          ) : null}

          {/* Guest Card */}
          <View className="flex-row items-center justify-between rounded-xl border border-line bg-surface p-3">
            <View className="flex-row items-center gap-2.5">
              <View className="size-9 items-center justify-center rounded-full bg-surface-muted">
                <User size={18} color="#00112e" />
              </View>
              <View>
                <Text className="text-sm font-bold text-navy-900">
                  {enquiry.customer_name || "Guest"}
                </Text>
                {enquiry.customer_phone ? (
                  <Text className="text-xs text-text-muted">{enquiry.customer_phone}</Text>
                ) : (
                  <Text className="text-xs italic text-text-muted">No phone provided</Text>
                )}
              </View>
            </View>

            {enquiry.customer_phone ? (
              <Button
                variant="outline"
                size="sm"
                onPress={handleCall}
                className="h-8 gap-1.5 px-3"
              >
                <Phone size={13} color="#00112e" />
                <Text className="text-xs font-bold text-navy-900">Call</Text>
              </Button>
            ) : null}
          </View>

          {/* Enquiry Details Grid */}
          <View className="rounded-xl border border-line bg-surface p-3">
            <Text className="text-xs font-bold text-navy-900">Enquiry Details</Text>

            <View className="mt-2.5 flex-col gap-2">
              <View className="flex-row items-center justify-between py-1 border-b border-line/60">
                <View className="flex-row items-center gap-1.5">
                  <Home size={13} color="#71717a" />
                  <Text className="text-xs text-text-muted">Property & Room</Text>
                </View>
                <Text className="text-xs font-semibold text-navy-900">
                  {enquiry.property?.title || enquiry.property_title || "Stay"} ·{" "}
                  {enquiry.unit?.name || enquiry.unit_name || "Room"}
                </Text>
              </View>

              <View className="flex-row items-center justify-between py-1 border-b border-line/60">
                <View className="flex-row items-center gap-1.5">
                  <Calendar size={13} color="#71717a" />
                  <Text className="text-xs text-text-muted">Move-in date</Text>
                </View>
                <Text className="text-xs font-semibold text-navy-900">
                  {enquiry.check_in || "Flexible"}
                </Text>
              </View>

              <View className="flex-row items-center justify-between py-1 border-b border-line/60">
                <View className="flex-row items-center gap-1.5">
                  <Clock size={13} color="#71717a" />
                  <Text className="text-xs text-text-muted">Stay duration</Text>
                </View>
                <Text className="text-xs font-semibold text-navy-900">{durationStr}</Text>
              </View>

              <View className="flex-row items-center justify-between py-1">
                <Text className="text-xs text-text-muted">Status</Text>
                <Badge tone={badge.tone}>
                  <Text className="text-[11px] font-bold">{badge.label}</Text>
                </Badge>
              </View>
            </View>
          </View>

          {/* Guest Message */}
          {enquiry.message ? (
            <View className="rounded-xl border border-line bg-surface p-3">
              <View className="flex-row items-center gap-1.5">
                <MessageSquare size={13} color="#71717a" />
                <Text className="text-xs font-bold text-navy-900">Message from Guest</Text>
              </View>
              <Text className="mt-2 text-xs leading-relaxed text-text">
                &ldquo;{enquiry.message}&rdquo;
              </Text>
            </View>
          ) : null}

          {/* Host Response Note if closed */}
          {enquiry.host_response ? (
            <View className="rounded-xl border border-line bg-surface-muted p-3">
              <Text className="text-xs font-semibold text-text-muted">Your Note to Guest</Text>
              <Text className="mt-1 text-xs text-text">{enquiry.host_response}</Text>
            </View>
          ) : null}

          {/* Inline Action Forms */}
          {booking ? (
            <View className="flex-col gap-2 rounded-xl border border-line bg-surface-muted p-3">
              <Text className="text-sm font-bold text-navy-900">Mark Room Booked</Text>
              <Text className="text-xs text-text-muted">
                Which room is being booked? We will reserve it and decrement available count.
              </Text>

              {rooms.length === 0 ? (
                <Text className="text-xs italic text-amber-700">
                  No rooms found for this property. You can still confirm the booking.
                </Text>
              ) : (
                <View className="flex-col gap-1.5">
                  {rooms.map((room: BookableRoomOption) => {
                    const isSelected = effectiveRoomId === room.id;
                    return (
                      <Pressable
                        key={room.id}
                        onPress={() => setRoomId(room.id)}
                        className={`rounded-lg border p-2.5 flex-row items-center justify-between ${
                          isSelected
                            ? "border-navy-900 bg-surface shadow-xs"
                            : "border-line bg-surface/60"
                        }`}
                      >
                        <Text
                          className={`text-xs ${isSelected ? "font-bold text-navy-900" : "text-text"}`}
                        >
                          {room.label}
                        </Text>
                        {isSelected ? <CheckCircle2 size={14} color="#00112e" /> : null}
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
                  onPress={() => onBooked(enquiry.id, effectiveRoomId || null)}
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
              <Text className="text-sm font-bold text-navy-900">Not Available</Text>
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
                    onPress={() => {
                      setBooking(true);
                      if (!roomId && rooms[0]?.id) {
                        setRoomId(rooms[0].id);
                      }
                    }}
                    className="h-8 px-3"
                  >
                    <Text className="text-xs font-bold text-white">Mark Room Booked</Text>
                  </Button>
                </>
              ) : status === "CONFIRMED" ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  onPress={() => setCancelConfirmOpen(true)}
                  className="h-8 px-3 border-rose-300"
                >
                  <Text className="text-xs font-semibold text-rose-700">Cancel Booking</Text>
                </Button>
              ) : (
                <Button
                  variant="secondary"
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
