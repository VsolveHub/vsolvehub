import { Button, Dialog, Input, QuantityStepper, Text } from "@vsolve/mobile-ui";
import { useEffect, useState } from "react";
import { Image, Pressable, ScrollView, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { Camera, Plus, Trash2, X } from "lucide-react-native";

import {
  type StayProperty,
  type StayRoom,
  type StayUnit,
  byRoomNumber,
} from "../model";
import {
  addPartnerStayRoom,
  addPartnerStayUnitMedia,
  createPartnerStayUnit,
  deletePartnerStayRoom,
  deletePartnerStayUnitMedia,
  partnerStayRoomAction,
  updatePartnerStayRoom,
  updatePartnerStayUnit,
  uploadPartnerStayPhoto,
} from "../queries";

export const FALLBACK_ROOM_NAMES = [
  "Single Room",
  "Double Sharing",
  "Triple Sharing",
  "Deluxe Room",
  "Dormitory Bed",
  "Studio",
  "Executive Room",
];

/** "101, 102 103" or one per line -> ["101", "102", "103"]. */
export function splitRoomNumbers(input: string): string[] {
  return input
    .split(/[,\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function UnitSheet({
  open,
  onOpenChange,
  property,
  editingUnit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  property?: StayProperty | null;
  editingUnit?: StayUnit | null;
}) {
  const qc = useQueryClient();

  // Basic fields
  const [name, setName] = useState("");
  const [rateRupees, setRateRupees] = useState("");
  const [sharingCount, setSharingCount] = useState(1);
  const [maxGuests, setMaxGuests] = useState(1);
  const [quantity, setQuantity] = useState(1);
  const [roomNumbersText, setRoomNumbersText] = useState("");

  // Photos
  const [draftPhotos, setDraftPhotos] = useState<string[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);

  // Sub-dialogs for room management
  const [bookingRoom, setBookingRoom] = useState<StayRoom | null>(null);
  const [occupantName, setOccupantName] = useState("");
  const [releaseRoom, setReleaseRoom] = useState<StayRoom | null>(null);
  const [offRoom, setOffRoom] = useState<StayRoom | null>(null);
  const [newRoomNumber, setNewRoomNumber] = useState("");
  const [addingRoomNum, setAddingRoomNum] = useState(false);

  // Error & Status
  const [error, setError] = useState<string | null>(null);

  const isEditing = Boolean(editingUnit);
  const style = property?.room_style ?? "MIXED";
  const pricePeriod = property?.price_period ?? "MONTH";

  useEffect(() => {
    if (open) {
      queueMicrotask(() => {
        setError(null);
        setBookingRoom(null);
        setOccupantName("");
        setReleaseRoom(null);
        setOffRoom(null);
        setAddingRoomNum(false);
        setNewRoomNumber("");

        if (editingUnit) {
          setName(editingUnit.name);
          setRateRupees(String(Math.round(editingUnit.nightly_rate_paise / 100)));
          setSharingCount(editingUnit.sharing_count ?? 1);
          setMaxGuests(editingUnit.max_guests ?? 1);
          setQuantity(editingUnit.quantity ?? 1);
          setRoomNumbersText("");
          setDraftPhotos([]);
        } else {
          setName("");
          setRateRupees("");
          setSharingCount(style === "PRIVATE" ? 1 : 2);
          setMaxGuests(style === "SHARED" ? 1 : 2);
          setQuantity(1);
          setRoomNumbersText("");
          setDraftPhotos([]);
        }
      });
    }
  }, [open, editingUnit, style]);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["partner-stay-properties"] });
    void qc.invalidateQueries({ queryKey: ["partner-stays"] });
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!property) throw new Error("Property not selected");
      const ratePaise = Math.round(Number(rateRupees) * 100);
      const roomNumbers = splitRoomNumbers(roomNumbersText);
      const computedQuantity = roomNumbers.length > 0 ? roomNumbers.length : quantity;

      return createPartnerStayUnit(property.id, {
        name: name.trim(),
        nightly_rate_paise: ratePaise,
        sharing_count: style === "PRIVATE" ? 1 : sharingCount,
        max_guests: style === "SHARED" ? sharingCount : maxGuests,
        quantity: computedQuantity,
        room_numbers: roomNumbers,
        image_urls: draftPhotos,
      });
    },
    onSuccess: () => {
      invalidate();
      onOpenChange(false);
    },
    onError: (err: any) => setError(err?.message || "Failed to add room unit"),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingUnit) throw new Error("No unit selected for edit");
      const ratePaise = Math.round(Number(rateRupees) * 100);

      return updatePartnerStayUnit(editingUnit.id, {
        name: name.trim(),
        nightly_rate_paise: ratePaise,
        sharing_count: style === "PRIVATE" ? 1 : sharingCount,
        max_guests: style === "SHARED" ? sharingCount : maxGuests,
      });
    },
    onSuccess: () => {
      invalidate();
      onOpenChange(false);
    },
    onError: (err: any) => setError(err?.message || "Failed to update room unit"),
  });

  const handlePickPhotos = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (result.canceled || !result.assets.length) return;

    setUploadingPhotos(true);
    setError(null);
    try {
      for (const asset of result.assets) {
        if (asset.fileSize && asset.fileSize > 10 * 1024 * 1024) {
          setError("Each photo must be 10 MB or smaller.");
          continue;
        }
        const uploaded = await uploadPartnerStayPhoto(asset.uri, asset.fileName || "room.jpg");
        if (isEditing && editingUnit) {
          await addPartnerStayUnitMedia(editingUnit.id, uploaded.url);
          invalidate();
        } else {
          setDraftPhotos((prev) => [...prev, uploaded.url]);
        }
      }
    } catch (err: any) {
      setError(err?.message || "Could not upload photo.");
    } finally {
      setUploadingPhotos(false);
    }
  };

  const handleRemovePhoto = async (indexOrMediaId: string | number) => {
    if (isEditing && editingUnit && typeof indexOrMediaId === "string") {
      try {
        await deletePartnerStayUnitMedia(editingUnit.id, indexOrMediaId);
        invalidate();
      } catch (err: any) {
        setError(err?.message || "Failed to remove photo.");
      }
    } else if (typeof indexOrMediaId === "number") {
      setDraftPhotos((prev) => prev.filter((_, i) => i !== indexOrMediaId));
    }
  };

  const handleAddIndividualRoom = async () => {
    if (!editingUnit || !newRoomNumber.trim()) return;
    setError(null);
    try {
      await addPartnerStayRoom(editingUnit.id, { number: newRoomNumber.trim() });
      setNewRoomNumber("");
      setAddingRoomNum(false);
      invalidate();
    } catch (err: any) {
      setError(err?.message || "Failed to add room number.");
    }
  };

  const handleToggleRoom = async (room: StayRoom) => {
    if (room.status === "AVAILABLE") {
      setOffRoom(room);
    } else {
      try {
        await updatePartnerStayRoom(room.id, { available: true });
        invalidate();
      } catch (err: any) {
        setError(err?.message || "Failed to update room availability.");
      }
    }
  };

  const handleSave = () => {
    if (!name.trim()) {
      setError("Name the room, for example “Deluxe” or “Double sharing”.");
      return;
    }
    const rate = Number(rateRupees);
    if (isNaN(rate) || rate <= 0) {
      setError(`Enter the price in rupees.`);
      return;
    }

    if (!isEditing) {
      const roomNumbers = splitRoomNumbers(roomNumbersText);
      const lower = roomNumbers.map((n) => n.toLowerCase());
      const repeated = roomNumbers.find((n, i) => lower.indexOf(n.toLowerCase()) !== i);
      if (repeated) {
        setError(`${repeated} is listed twice.`);
        return;
      }
    }

    setError(null);
    if (isEditing) {
      updateMutation.mutate();
    } else {
      createMutation.mutate();
    }
  };

  const existingRooms = [...(editingUnit?.rooms ?? [])].sort(byRoomNumber);
  const existingMedia = editingUnit?.media ?? [];

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        title={isEditing ? `Edit ${editingUnit?.name}` : "Add room type"}
        description={
          property
            ? `Configure pricing and availability for ${property.title}`
            : "Configure room type and numbers"
        }
      >
        <ScrollView className="max-h-[75vh]" showsVerticalScrollIndicator={false}>
          <View className="flex-col gap-4 py-2">
            {/* Room Name & Suggestions */}
            <View>
              <Text className="text-xs font-semibold text-text">Room Name *</Text>
              <Input
                value={name}
                onChangeText={setName}
                placeholder="e.g. Deluxe Room or Double Sharing"
                className="mt-1.5"
              />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-2">
                <View className="flex-row gap-1.5">
                  {FALLBACK_ROOM_NAMES.map((suggestion) => (
                    <Pressable
                      key={suggestion}
                      onPress={() => setName(suggestion)}
                      className={`rounded-full border px-2.5 py-1 ${
                        name === suggestion
                          ? "border-[#071328] bg-[#071328]"
                          : "border-line bg-surface-muted"
                      }`}
                    >
                      <Text
                        className={`text-xs font-semibold ${
                          name === suggestion ? "text-white" : "text-text"
                        }`}
                      >
                        {suggestion}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            </View>

            {/* Price */}
            <View>
              <Text className="text-xs font-semibold text-text">
                {pricePeriod === "NIGHT" ? "Price per night (₹) *" : "Rent per month (₹) *"}
              </Text>
              <View className="relative mt-1.5">
                <Input
                  value={rateRupees}
                  onChangeText={setRateRupees}
                  placeholder="e.g. 8500"
                  keyboardType="numeric"
                  className="pl-7"
                />
                <Text className="absolute left-3 top-3 text-sm font-bold text-text-muted">₹</Text>
              </View>
            </View>

            {/* Room Numbers / Quantity (New Mode) */}
            {!isEditing ? (
              <View className="flex-col gap-2">
                <Text className="text-xs font-semibold text-text">Room numbers (Optional)</Text>
                <Text className="text-[11px] text-text-muted">
                  One per room, separated by commas — e.g. 101, 102, 103.
                </Text>
                <Input
                  value={roomNumbersText}
                  onChangeText={setRoomNumbersText}
                  placeholder="101, 102, 103"
                  multiline
                  className="min-h-[3.5rem] py-2"
                />
                {splitRoomNumbers(roomNumbersText).length === 0 ? (
                  <View className="mt-2">
                    <Text className="text-xs font-semibold text-text">Number of rooms *</Text>
                    <View className="mt-1.5">
                      <QuantityStepper
                        value={quantity}
                        onChange={setQuantity}
                        min={1}
                        max={100}
                        label="Number of rooms"
                        decrementLabel="Decrease rooms"
                        incrementLabel="Increase rooms"
                      />
                    </View>
                  </View>
                ) : (
                  <Text className="text-xs text-text-muted font-medium">
                    {splitRoomNumbers(roomNumbersText).length} room(s) of this type will be created.
                  </Text>
                )}
              </View>
            ) : null}

            {/* Guests & Sharing */}
            <View className="flex-col gap-3">
              {style !== "SHARED" ? (
                <View>
                  <Text className="text-xs font-semibold text-text">Guests per room</Text>
                  <Text className="text-[11px] text-text-muted mb-1.5">
                    Most people one booking of this room can bring.
                  </Text>
                  <QuantityStepper
                    value={maxGuests}
                    onChange={setMaxGuests}
                    min={1}
                    max={10}
                    label="Guests per room"
                    decrementLabel="Decrease guests"
                    incrementLabel="Increase guests"
                  />
                </View>
              ) : null}

              {style !== "PRIVATE" ? (
                <View>
                  <Text className="text-xs font-semibold text-text">People sharing this room</Text>
                  <Text className="text-[11px] text-text-muted mb-1.5">
                    1 for single room, 2 for double sharing, etc.
                  </Text>
                  <QuantityStepper
                    value={sharingCount}
                    onChange={setSharingCount}
                    min={1}
                    max={10}
                    label="People sharing"
                    decrementLabel="Decrease sharing"
                    incrementLabel="Increase sharing"
                  />
                </View>
              ) : null}
            </View>

            {/* Photos */}
            <View className="flex-col gap-2">
              <Text className="text-xs font-semibold text-text">Room photos</Text>
              <Text className="text-[11px] text-text-muted">
                Show the bed, washroom and view. Up to 8 photos, 10 MB each.
              </Text>

              <View className="flex-row flex-wrap gap-2">
                {/* Existing media in edit mode */}
                {isEditing &&
                  existingMedia.map((m) => (
                    <View
                      key={m.id}
                      className="relative h-20 w-20 overflow-hidden rounded-lg border border-line bg-surface-muted"
                    >
                      <Image source={{ uri: m.url }} className="h-full w-full" resizeMode="cover" />
                      <Pressable
                        onPress={() => handleRemovePhoto(m.id)}
                        className="absolute right-1 top-1 size-5 items-center justify-center rounded-full bg-white shadow-xs"
                      >
                        <X size={12} color="#071328" />
                      </Pressable>
                    </View>
                  ))}

                {/* Draft photos in create mode */}
                {!isEditing &&
                  draftPhotos.map((url, index) => (
                    <View
                      key={url}
                      className="relative h-20 w-20 overflow-hidden rounded-lg border border-line bg-surface-muted"
                    >
                      <Image source={{ uri: url }} className="h-full w-full" resizeMode="cover" />
                      <Pressable
                        onPress={() => handleRemovePhoto(index)}
                        className="absolute right-1 top-1 size-5 items-center justify-center rounded-full bg-white shadow-xs"
                      >
                        <X size={12} color="#071328" />
                      </Pressable>
                    </View>
                  ))}

                {/* Add Photo Button */}
                <Pressable
                  onPress={handlePickPhotos}
                  disabled={uploadingPhotos}
                  className="h-20 w-20 items-center justify-center rounded-lg border-2 border-dashed border-line bg-surface-muted"
                >
                  <Camera size={20} color="#71717a" />
                  <Text className="mt-1 text-[10px] font-semibold text-text-muted">
                    {uploadingPhotos ? "Uploading…" : "Add photo"}
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Individual Numbered Rooms Management (Edit Mode) */}
            {isEditing && (
              <View className="mt-2 flex-col gap-2 rounded-xl border border-line bg-surface-muted p-3">
                <View className="flex-row items-center justify-between">
                  <Text className="text-xs font-bold text-text">Numbered Rooms</Text>
                  <Pressable
                    onPress={() => setAddingRoomNum((prev) => !prev)}
                    className="flex-row items-center gap-1"
                  >
                    <Plus size={13} color="#071328" />
                    <Text className="text-xs font-semibold text-[#071328]">Add Room</Text>
                  </Pressable>
                </View>

                {addingRoomNum ? (
                  <View className="flex-row items-center gap-2 mt-1">
                    <Input
                      value={newRoomNumber}
                      onChangeText={setNewRoomNumber}
                      placeholder="e.g. 104"
                      className="flex-1 h-8 text-xs"
                    />
                    <Button
                      variant="primary"
                      size="sm"
                      onPress={handleAddIndividualRoom}
                      className="h-8 px-3"
                    >
                      <Text className="text-xs font-bold text-white">Save</Text>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onPress={() => setAddingRoomNum(false)}
                      className="h-8 px-2"
                    >
                      <Text className="text-xs text-text-muted">Cancel</Text>
                    </Button>
                  </View>
                ) : null}

                <View className="flex-col gap-2 mt-1">
                  {existingRooms.map((room) => {
                    const isAvailable = room.status === "AVAILABLE";
                    const isBooked = room.status === "BOOKED";

                    return (
                      <View
                        key={room.id}
                        className="flex-row items-center justify-between rounded-lg border border-line bg-surface p-2.5"
                      >
                        <View className="flex-1">
                          <Text className="text-sm font-bold text-text">{room.number}</Text>
                          <Text className="text-[11px] text-text-muted">
                            {isBooked
                              ? `🔴 Booked ${room.occupant_name ? `· ${room.occupant_name}` : ""}`
                              : isAvailable
                                ? "🟢 Available"
                                : "⚪ Switched off"}
                          </Text>
                        </View>

                        <View className="flex-row items-center gap-2">
                          {isBooked ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onPress={() => setReleaseRoom(room)}
                              className="h-7 px-2"
                            >
                              <Text className="text-[11px] font-semibold text-text">Release</Text>
                            </Button>
                          ) : (
                            <>
                              <Pressable
                                onPress={() => handleToggleRoom(room)}
                                className={`h-7 px-2.5 rounded-full items-center justify-center border ${
                                  isAvailable
                                    ? "bg-emerald-50 border-emerald-300"
                                    : "bg-surface-muted border-line"
                                }`}
                              >
                                <Text
                                  className={`text-[11px] font-bold ${
                                    isAvailable ? "text-emerald-800" : "text-text-muted"
                                  }`}
                                >
                                  {isAvailable ? "ON" : "OFF"}
                                </Text>
                              </Pressable>

                              <Button
                                variant="secondary"
                                size="sm"
                                onPress={() => {
                                  setOccupantName("");
                                  setBookingRoom(room);
                                }}
                                className="h-7 px-2"
                              >
                                <Text className="text-[11px] font-semibold text-text">Book</Text>
                              </Button>

                              {existingRooms.length > 1 ? (
                                <Pressable
                                  onPress={async () => {
                                    try {
                                      await deletePartnerStayRoom(room.id);
                                      invalidate();
                                    } catch (err: any) {
                                      setError(err?.message || "Failed to delete room.");
                                    }
                                  }}
                                  className="size-7 items-center justify-center rounded-full bg-rose-50"
                                >
                                  <Trash2 size={12} color="#e11d48" />
                                </Pressable>
                              ) : null}
                            </>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {error ? <Text className="text-xs text-rose-600">{error}</Text> : null}

            {/* Action Buttons */}
            <Button
              variant="primary"
              onPress={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending || uploadingPhotos}
              className="mt-2"
            >
              <Text className="font-bold text-white">
                {createMutation.isPending || updateMutation.isPending
                  ? "Saving…"
                  : isEditing
                    ? "Save room type"
                    : "Add room type"}
              </Text>
            </Button>
          </View>
        </ScrollView>
      </Dialog>

      {/* Turn off room dialog */}
      <Dialog
        open={Boolean(offRoom)}
        onOpenChange={(o) => !o && setOffRoom(null)}
        title={offRoom ? `Turn off ${offRoom.number}?` : ""}
        description="This room will no longer appear as available to customers."
      >
        <View className="flex-row justify-end gap-2 pt-3">
          <Button variant="ghost" size="sm" onPress={() => setOffRoom(null)}>
            <Text className="text-xs font-semibold text-text">Keep it on</Text>
          </Button>
          <Button
            variant="primary"
            size="sm"
            onPress={async () => {
              if (offRoom) {
                await updatePartnerStayRoom(offRoom.id, { available: false });
                setOffRoom(null);
                invalidate();
              }
            }}
          >
            <Text className="text-xs font-bold text-white">Turn off</Text>
          </Button>
        </View>
      </Dialog>

      {/* Mark Booked dialog */}
      <Dialog
        open={Boolean(bookingRoom)}
        onOpenChange={(o) => !o && setBookingRoom(null)}
        title="Booking confirmed?"
        description={
          bookingRoom
            ? `${bookingRoom.number} will show as Booked and stop appearing as available.`
            : ""
        }
      >
        <View className="py-2">
          <Text className="text-xs font-semibold text-text">Guest&apos;s name (Optional)</Text>
          <Input
            value={occupantName}
            onChangeText={setOccupantName}
            placeholder="For your own reference"
            className="mt-1.5"
          />
          <View className="flex-row justify-end gap-2 pt-4">
            <Button variant="ghost" size="sm" onPress={() => setBookingRoom(null)}>
              <Text className="text-xs font-semibold text-text">Not yet</Text>
            </Button>
            <Button
              variant="primary"
              size="sm"
              onPress={async () => {
                if (bookingRoom) {
                  await partnerStayRoomAction(bookingRoom.id, "book", {
                    occupant_name: occupantName.trim(),
                  });
                  setBookingRoom(null);
                  invalidate();
                }
              }}
            >
              <Text className="text-xs font-bold text-white">Yes – Mark Booked</Text>
            </Button>
          </View>
        </View>
      </Dialog>

      {/* Mark Available dialog */}
      <Dialog
        open={Boolean(releaseRoom)}
        onOpenChange={(o) => !o && setReleaseRoom(null)}
        title={releaseRoom ? `Make ${releaseRoom.number} available again?` : ""}
        description="Use this when the guest has moved out or the booking fell through. Guests will see the room as available."
      >
        <View className="flex-row justify-end gap-2 pt-3">
          <Button variant="ghost" size="sm" onPress={() => setReleaseRoom(null)}>
            <Text className="text-xs font-semibold text-text">Cancel</Text>
          </Button>
          <Button
            variant="primary"
            size="sm"
            onPress={async () => {
              if (releaseRoom) {
                await partnerStayRoomAction(releaseRoom.id, "release");
                setReleaseRoom(null);
                invalidate();
              }
            }}
          >
            <Text className="text-xs font-bold text-white">Mark available</Text>
          </Button>
        </View>
      </Dialog>
    </>
  );
}
