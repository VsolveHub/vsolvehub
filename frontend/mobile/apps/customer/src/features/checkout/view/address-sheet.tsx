// Ported from frontend/apps/customer/features/booking/view/address-stage.tsx
// Exact match with Image 2 (Where is the work? Dialog modal, choice card with badges, Use my location, Add a new address, and Use this address)
import { Badge, Button, Dialog, Input, Spinner, Text } from "@vsolve/mobile-ui";
import * as Location from "expo-location";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { useCreateAddress, useReverseGeocode, type Address } from "@/features/addresses/queries";

export interface AddressSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  addresses: readonly Address[];
  selectedAddressId: string | null;
  onSelect: (addressId: string) => void;
}

export function AddressSheet({
  open,
  onOpenChange,
  addresses,
  selectedAddressId,
  onSelect,
}: AddressSheetProps) {
  const createAddress = useCreateAddress();
  const reverseGeocode = useReverseGeocode();

  const [pendingAddressId, setPendingAddressId] = useState<string | null>(
    selectedAddressId ?? addresses[0]?.id ?? null,
  );
  const [mode, setMode] = useState<"list" | "add" | "edit">("list");
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);

  const [label, setLabel] = useState("Home");
  const [line1, setLine1] = useState("");
  const [locality, setLocality] = useState("");
  const [city, setCity] = useState("Hyderabad");
  const [postal, setPostal] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);

  async function handleUseLocation() {
    setLocating(true);
    setLocateError(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        setLocateError("Location permission denied. Please allow access or type your address.");
        setLocating(false);
        return;
      }
      const position = await Location.getCurrentPositionAsync({});
      const lat = String(position.coords.latitude);
      const lng = String(position.coords.longitude);
      setLatitude(lat);
      setLongitude(lng);

      reverseGeocode.mutate(
        { latitude: lat, longitude: lng },
        {
          onSuccess: (found) => {
            setLine1(found.line1 || "");
            setLocality(found.locality || "");
            setCity(found.city || "Hyderabad");
            setPostal(found.postal_code || "");
            setMode("add");
            setLocating(false);
          },
          onError: () => {
            setMode("add");
            setLocating(false);
          },
        },
      );
    } catch {
      setLocateError("Could not retrieve current location. Please enter your address below.");
      setLocating(false);
    }
  }

  function handleSaveAddress() {
    if (!line1 || !postal) return;
    createAddress.mutate(
      {
        label,
        line1,
        locality,
        city,
        postal_code: postal,
        latitude,
        longitude,
        state: "Telangana",
        country_code: "IN",
      },
      {
        onSuccess: (created) => {
          onSelect(created.id);
          setPendingAddressId(created.id);
          setMode("list");
          onOpenChange(false);
        },
      },
    );
  }

  function handleConfirmAddress() {
    if (pendingAddressId) {
      onSelect(pendingAddressId);
    }
    onOpenChange(false);
  }

  const title =
    mode === "list"
      ? "Where is the work?"
      : mode === "add"
        ? "Add a new address"
        : "Edit this address";

  const description =
    mode === "list"
      ? "Pick a saved address or add a new one."
      : "Saved to your account, so you only type it once.";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setMode("list");
          onOpenChange(false);
        }
      }}
      title={title}
      description={description}
      className="max-h-[85vh] p-6"
      footer={
        mode === "list" ? (
          <View className="flex-row items-center justify-end gap-3 pt-2">
            <Pressable
              accessibilityRole="button"
              onPress={() => onOpenChange(false)}
              className="px-4 py-2.5"
            >
              <Text className="text-sm font-semibold text-navy-950">Cancel</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={handleConfirmAddress}
              className="rounded-xl bg-[#EA580C] px-5 py-2.5 active:bg-[#C2410C]"
            >
              <Text className="text-sm font-bold text-white">Use this address</Text>
            </Pressable>
          </View>
        ) : (
          <View className="flex-row items-center justify-between gap-3 pt-2">
            <Pressable
              accessibilityRole="button"
              onPress={() => setMode("list")}
              className="px-3 py-2"
            >
              <Text className="text-sm font-semibold text-text-secondary">
                Back to saved addresses
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={handleSaveAddress}
              className="rounded-xl bg-[#EA580C] px-5 py-2.5 active:bg-[#C2410C]"
            >
              <Text className="text-sm font-bold text-white">Save address</Text>
            </Pressable>
          </View>
        )
      }
    >
      <ScrollView className="max-h-[460px]" showsVerticalScrollIndicator={false}>
        {mode === "list" ? (
          <View className="gap-4 pb-2">
            {/* Saved Addresses List */}
            <View className="gap-3">
              {addresses.map((address, idx) => {
                const isSelected = (pendingAddressId ?? selectedAddressId) === address.id;
                const isDefault = address.is_default || idx === 0;

                return (
                  <Pressable
                    key={address.id}
                    onPress={() => setPendingAddressId(address.id)}
                    className={
                      isSelected
                        ? "flex-row items-start gap-3.5 rounded-xl border border-[#FDBA74] bg-[#FFF9F5] p-4"
                        : "flex-row items-start gap-3.5 rounded-xl border border-line bg-surface p-4"
                    }
                  >
                    {/* Radio Button */}
                    <View
                      className={
                        isSelected
                          ? "mt-0.5 size-5 items-center justify-center rounded-full border-2 border-[#EA580C]"
                          : "mt-0.5 size-5 items-center justify-center rounded-full border-2 border-[#D1CBC3]"
                      }
                    >
                      {isSelected ? (
                        <View className="size-2.5 rounded-full bg-[#EA580C]" />
                      ) : null}
                    </View>

                    {/* Address Content */}
                    <View className="flex-1 min-w-0">
                      <View className="flex-row flex-wrap items-center gap-2">
                        <Text className="text-base font-bold text-navy-950">
                          {address.label || "Home"}
                        </Text>
                        {isDefault ? (
                          <View className="rounded bg-[#EFEBE4] px-2 py-0.5">
                            <Text className="text-[11px] font-medium text-text-secondary">
                              Default
                            </Text>
                          </View>
                        ) : null}
                        {isSelected ? (
                          <View className="rounded bg-[#E6F4EA] px-2 py-0.5">
                            <Text className="text-[11px] font-semibold text-[#137333]">
                              Selected
                            </Text>
                          </View>
                        ) : null}
                      </View>

                      <Text className="mt-1.5 text-xs text-text-secondary leading-relaxed">
                        {address.line1}
                        {address.locality ? `, ${address.locality}` : ""}
                        {address.city ? `, ${address.city}` : ""}
                        {address.postal_code ? `, ${address.postal_code}` : ""}
                      </Text>
                    </View>

                    {/* Edit Action Button */}
                    <Pressable
                      onPress={() => {
                        setEditingAddress(address);
                        setLabel(address.label || "Home");
                        setLine1(address.line1);
                        setLocality(address.locality || "");
                        setCity(address.city || "Hyderabad");
                        setPostal(address.postal_code || "");
                        setMode("edit");
                      }}
                      className="px-2 py-1"
                    >
                      <Text className="text-sm font-semibold text-navy-900">Edit</Text>
                    </Pressable>
                  </Pressable>
                );
              })}
            </View>

            {/* Action Buttons */}
            <View className="gap-2.5 pt-1">
              <Pressable
                accessibilityRole="button"
                disabled={locating}
                onPress={handleUseLocation}
                className="w-full items-center justify-center rounded-xl bg-[#EA580C] py-3 active:bg-[#C2410C]"
              >
                {locating ? (
                  <View className="flex-row items-center gap-2">
                    <Spinner size="sm" />
                    <Text className="text-sm font-bold text-white">Finding your location…</Text>
                  </View>
                ) : (
                  <Text className="text-sm font-bold text-white">Use my location</Text>
                )}
              </Pressable>

              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setLabel("Home");
                  setLine1("");
                  setLocality("");
                  setCity("Hyderabad");
                  setPostal("");
                  setMode("add");
                }}
                className="w-full items-center justify-center rounded-xl border border-line bg-surface py-3 active:bg-surface-sunken"
              >
                <Text className="text-sm font-semibold text-navy-950">Add a new address</Text>
              </Pressable>

              {locateError ? (
                <Text className="text-xs text-danger-text text-center">{locateError}</Text>
              ) : null}
            </View>

            {/* Note */}
            <Text className="text-xs text-text-muted leading-relaxed pt-1">
              Changing the address re-checks who can reach it.
            </Text>
          </View>
        ) : (
          /* Address Entry Form */
          <View className="gap-3.5 pb-2">
            <View>
              <Text className="text-xs font-semibold text-text-secondary mb-1">
                Label (Home, Work, etc.)
              </Text>
              <Input value={label} onChangeText={setLabel} placeholder="Home" />
            </View>

            <View>
              <Text className="text-xs font-semibold text-text-secondary mb-1">
                House, flat or building
              </Text>
              <Input
                value={line1}
                onChangeText={setLine1}
                placeholder="Flat 402, Royal Palms"
              />
            </View>

            <View>
              <Text className="text-xs font-semibold text-text-secondary mb-1">Locality</Text>
              <Input
                value={locality}
                onChangeText={setLocality}
                placeholder="Khajaguda, Gachibowli"
              />
            </View>

            <View className="flex-row gap-3">
              <View className="flex-1">
                <Text className="text-xs font-semibold text-text-secondary mb-1">City</Text>
                <Input value={city} onChangeText={setCity} placeholder="Hyderabad" />
              </View>
              <View className="flex-1">
                <Text className="text-xs font-semibold text-text-secondary mb-1">PIN code</Text>
                <Input
                  value={postal}
                  onChangeText={setPostal}
                  placeholder="500032"
                  keyboardType="numeric"
                />
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </Dialog>
  );
}
