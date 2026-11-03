import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, COLOR_TOKENS, Dialog, Input, Text, useT } from "@vsolve/mobile-ui";
import * as ImagePicker from "expo-image-picker";
import { BedDouble, Camera, Plus, X } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, View } from "react-native";

import {
  byRoomNumber,
  type StayLook,
  type StayUnit,
} from "../model";
import {
  addPartnerStayRoom,
  uploadPartnerStayPhoto,
} from "../queries";
import { THEME_COLORS } from "../theme-colors";

function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    const msg = (err as { message: unknown }).message;
    if (typeof msg === "string") return msg;
  }
  return fallback;
}

export const NEW = "__new__";

type Translate = ReturnType<typeof useT>;

/** "Same as 101, 102, 103". */
export function sameAsLabel(numbers: string[], t: Translate): string {
  if (numbers.length === 0) return t("stays.addRoom.noRoomsYet");
  const shown = numbers.slice(0, 4).join(", ");
  const rooms = `${shown}${numbers.length > 4 ? ` +${numbers.length - 4}` : ""}`;
  return t("stays.addRoom.sameAs", { rooms });
}

/** What adding this room does to the guest cards, in one line. */
export function addRoomOutcome(
  choice: string,
  looks: StayLook[],
  unitName: string,
  t: Translate,
): string {
  if (choice === NEW) return t("stays.addRoom.outcomeNew", { name: unitName });
  const look = looks.find((l) => l.id === choice);
  const title = look?.display_name || unitName;
  return t("stays.addRoom.outcomeJoins", { title });
}

/**
 * Add one room to a room type, and say how it looks.
 *
 * The host picks an existing look ("Same as 101, 102, 103") to reuse its photos, or starts a
 * new look with its own name and photos. The line at the bottom says what guests will see.
 */
export function AddRoomSheet({
  unit,
  open,
  onOpenChange,
}: {
  unit: StayUnit;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const looks = [...(unit.looks ?? [])].sort((a, b) => a.display_order - b.display_order);
  const rooms = [...(unit.rooms ?? [])].sort(byRoomNumber);

  const [number, setNumber] = useState("");
  const [choice, setChoice] = useState<string>(looks[0]?.id ?? NEW);
  const [lookName, setLookName] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setNumber("");
    setChoice(looks[0]?.id ?? NEW);
    setLookName("");
    setPhotos([]);
    setError(null);
  };

  const add = useMutation({
    mutationFn: () =>
      addPartnerStayRoom(unit.id, {
        number: number.trim(),
        ...(choice === NEW
          ? { new_look: { name: lookName.trim(), image_urls: photos } }
          : { look_id: choice }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["partner-stay-properties"] });
      void qc.invalidateQueries({ queryKey: ["partner-stays"] });
      reset();
      onOpenChange(false);
    },
    onError: (err: unknown) => setError(getErrorMessage(err, t("stays.addRoom.errorUnexpected"))),
  });

  const handlePickPhotos = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (result.canceled || !result.assets.length) return;

    setUploading(true);
    setError(null);
    try {
      for (const asset of result.assets) {
        if (asset.fileSize && asset.fileSize > 10 * 1024 * 1024) {
          setError(t("stays.photos.tooLarge"));
          continue;
        }
        const uploaded = await uploadPartnerStayPhoto(
          asset.uri,
          asset.fileName || "look-room.jpg",
        );
        setPhotos((prev) => [...prev, uploaded.url]);
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err, t("stays.addRoom.errorUnexpected")));
    } finally {
      setUploading(false);
    }
  };

  const handleRemovePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const onSubmit = () => {
    if (!number.trim()) {
      setError(t("stays.addRoom.numberMissing"));
      return;
    }
    if (choice === NEW && !lookName.trim()) {
      setError(t("stays.addRoom.lookNameMissing"));
      return;
    }
    setError(null);
    add.mutate();
  };

  const options = [
    ...looks.map((look) => ({
      id: look.id,
      title: look.name || t("stays.addRoom.mainLook", { name: unit.name }),
      caption: sameAsLabel(
        rooms.filter((r) => r.look === look.id).map((r) => r.number),
        t,
      ),
      cover: look.media[0]?.url,
    })),
    {
      id: NEW,
      title: t("stays.addRoom.newLook"),
      caption: t("stays.addRoom.differentPhotos"),
      cover: undefined,
    },
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
      title={t("stays.addRoom.title", { name: unit.name })}
      description={t("stays.addRoom.description")}
    >
      <ScrollView
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-5 py-2">
          {/* Room Number */}
          <View className="gap-1.5">
            <Text className="text-xs font-bold text-navy-900">
              {t("stays.addRoom.numberLabel")} *
            </Text>
            <Input
              value={number}
              maxLength={40}
              placeholder={t("stays.addRoom.numberPlaceholder")}
              onChangeText={setNumber}
              className="h-10 text-sm"
            />
          </View>

          {/* Look Options */}
          <View className="gap-2">
            <Text className="text-xs font-bold text-navy-900">
              {t("stays.addRoom.lookLegend")}
            </Text>
            <View className="flex-row flex-wrap gap-2.5">
              {options.map((option) => {
                const on = choice === option.id;
                return (
                  <Pressable
                    key={option.id}
                    onPress={() => setChoice(option.id)}
                    className={`w-[48%] overflow-hidden rounded-xl border bg-surface ${
                      on
                        ? "border-navy-900 ring-2 ring-navy-900 bg-navy-50/20"
                        : "border-line"
                    }`}
                  >
                    <View className="relative aspect-[4/3] w-full bg-surface-muted items-center justify-center">
                      {option.cover ? (
                        <Image
                          source={{ uri: option.cover }}
                          className="h-full w-full"
                          resizeMode="cover"
                        />
                      ) : option.id === NEW ? (
                        <Plus size={22} color={THEME_COLORS.zinc500} />
                      ) : (
                        <BedDouble size={22} color={THEME_COLORS.zinc500} />
                      )}
                    </View>
                    <View className="p-2 gap-0.5">
                      <Text className="text-xs font-bold text-navy-900" numberOfLines={1}>
                        {option.title}
                      </Text>
                      <Text className="text-[11px] text-text-muted" numberOfLines={1}>
                        {option.caption}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* New Look Fields if NEW selected */}
          {choice === NEW ? (
            <View className="gap-3 rounded-xl border border-line bg-surface-muted p-3">
              <View className="gap-1.5">
                <Text className="text-xs font-bold text-navy-900">
                  {t("stays.addRoom.lookNameLabel")} *
                </Text>
                <Text className="text-[11px] text-text-muted">
                  {t("stays.addRoom.lookNameDescription")}
                </Text>
                <Input
                  value={lookName}
                  maxLength={60}
                  placeholder={t("stays.addRoom.lookNamePlaceholder")}
                  onChangeText={setLookName}
                  className="h-10 text-sm bg-white"
                />
              </View>

              {/* Photos Draft for New Look */}
              <View className="gap-1.5">
                <Text className="text-xs font-semibold text-text">
                  {t("stays.photos.label")}
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {photos.map((url, idx) => (
                    <View
                      key={`${url}-${idx}`}
                      className="relative h-16 w-16 overflow-hidden rounded-lg border border-line bg-surface"
                    >
                      <Image source={{ uri: url }} className="h-full w-full" resizeMode="cover" />
                      <Pressable
                        onPress={() => handleRemovePhoto(idx)}
                        className="absolute right-1 top-1 size-5 items-center justify-center rounded-full bg-white shadow-xs"
                      >
                        <X size={12} color={THEME_COLORS.navy900} />
                      </Pressable>
                    </View>
                  ))}

                  <Pressable
                    onPress={handlePickPhotos}
                    disabled={uploading}
                    className="h-16 w-16 items-center justify-center rounded-lg border-2 border-dashed border-line bg-surface"
                  >
                    {uploading ? (
                      <ActivityIndicator size="small" color={THEME_COLORS.navy900} />
                    ) : (
                      <>
                        <Camera size={18} color={THEME_COLORS.zinc500} />
                        <Text className="mt-0.5 text-[9px] font-semibold text-text-muted">
                          {t("stays.photos.add")}
                        </Text>
                      </>
                    )}
                  </Pressable>
                </View>
              </View>
            </View>
          ) : null}

          {/* Outcome Banner */}
          <View className="rounded-xl bg-navy-50 p-3">
            <Text className="text-[10px] font-bold uppercase tracking-wider text-navy-700">
              {t("stays.addRoom.outcomeHeading")}
            </Text>
            <Text className="mt-1 text-xs font-semibold text-navy-900">
              {addRoomOutcome(choice, looks, unit.name, t)}
            </Text>
          </View>

          {/* Error Banner */}
          {error ? (
            <View className="rounded-lg bg-rose-50 border border-rose-200 p-2.5">
              <Text className="text-xs font-semibold text-rose-700">{error}</Text>
            </View>
          ) : null}

          {/* Footer Buttons */}
          <View className="mt-2 flex-row items-center justify-end gap-2">
            <Button
              variant="ghost"
              disabled={add.isPending}
              onPress={() => {
                reset();
                onOpenChange(false);
              }}
              className="h-10 px-4"
            >
              <Text className="text-xs font-bold text-text-muted">{t("common.cancel")}</Text>
            </Button>
            <Button
              variant="primary"
              disabled={add.isPending}
              onPress={onSubmit}
              className="h-10 px-4 min-w-[100px] items-center justify-center"
            >
              {add.isPending ? (
                <ActivityIndicator size="small" color={COLOR_TOKENS.white} />
              ) : (
                <Text className="text-xs font-bold text-white">
                  {number.trim()
                    ? t("stays.addRoom.submitNumbered", { number: number.trim() })
                    : t("stays.addRoom.submit")}
                </Text>
              )}
            </Button>
          </View>
        </View>
      </ScrollView>
    </Dialog>
  );
}
