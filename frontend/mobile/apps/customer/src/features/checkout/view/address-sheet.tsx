// Ported from frontend/apps/customer/features/booking/view/address-stage.tsx
// Exact match with Image 2 (Where is the work? Dialog modal, choice card with badges, Use my location, Add a new address, and Use this address)
import { Badge, Button, Dialog, Input, Spinner, Text } from "@vsolve/mobile-ui";
import * as Location from "expo-location";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import {
  useCreateAddress,
  useReverseGeocode,
  useUpdateAddress,
  type Address,
} from "@/features/addresses/queries";

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
  const { height: windowHeight } = useWindowDimensions();
  const createAddress = useCreateAddress();
  const updateAddress = useUpdateAddress();
  const reverseGeocode = useReverseGeocode();

  const [pendingAddressId, setPendingAddressId] = useState<string | null>(
    selectedAddressId ?? addresses[0]?.id ?? null,
  );

  // Sync pending selection ONLY when the sheet opens or when selectedAddressId changes externally
  useEffect(() => {
    if (open) {
      setPendingAddressId(selectedAddressId ?? addresses[0]?.id ?? null);
    }
  }, [open, selectedAddressId]);

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
  const [formError, setFormError] = useState<string | null>(null);

  async function handleUseLocation() {
    setLocating(true);
    setLocateError(null);
    setFormError(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        setLocateError("Location permission denied. Please allow access or type your address.");
        setLocating(false);
        return;
      }
      const position = await Location.getCurrentPositionAsync({});
      const lat = Number(position.coords.latitude).toFixed(6);
      const lng = Number(position.coords.longitude).toFixed(6);
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
            setLocality("Hyderabad");
            setCity("Hyderabad");
            setMode("add");
            setLocateError("Automatic address resolution failed. Please verify your address details below.");
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
    setFormError(null);

    const trimmedLine1 = line1.trim();
    if (!trimmedLine1) {
      setFormError("House, flat or building is required.");
      return;
    }

    const cleanPostal = postal.replace(/\D/g, "").slice(0, 6);
    if (cleanPostal.length !== 6) {
      setFormError("Enter a valid 6-digit Indian PIN code (e.g. 500032).");
      return;
    }

    const loc = locality.trim() || city.trim() || "Hyderabad";
    const ct = city.trim() || "Hyderabad";
    const lat =
      latitude && latitude.trim() !== ""
        ? latitude.trim()
        : editingAddress?.latitude
          ? String(editingAddress.latitude)
          : "17.414053";
    const lng =
      longitude && longitude.trim() !== ""
        ? longitude.trim()
        : editingAddress?.longitude
          ? String(editingAddress.longitude)
          : "78.353554";

    if (mode === "edit" && editingAddress) {
      updateAddress.mutate(
        {
          addressId: editingAddress.id,
          patch: {
            label: label.trim() || "Home",
            line1: trimmedLine1,
            locality: loc,
            city: ct,
            postal_code: cleanPostal,
            latitude: lat,
            longitude: lng,
            state: "Telangana",
            country_code: "IN",
          },
        },
        {
          onSuccess: (updated) => {
            onSelect(updated.id);
            setPendingAddressId(updated.id);
            setMode("list");
            setEditingAddress(null);
            setFormError(null);
          },
          onError: () => {
            setFormError("Could not update address. Please verify your PIN code and details.");
          },
        },
      );
      return;
    }

    createAddress.mutate(
      {
        label: label.trim() || "Home",
        line1: trimmedLine1,
        locality: loc,
        city: ct,
        postal_code: cleanPostal,
        latitude: lat,
        longitude: lng,
        state: "Telangana",
        country_code: "IN",
        source: latitude ? "REVERSE_GEOCODED" : "MANUAL",
        is_default: addresses.length === 0,
      },
      {
        onSuccess: (created) => {
          onSelect(created.id);
          setPendingAddressId(created.id);
          setMode("list");
          setFormError(null);
          onOpenChange(false);
        },
        onError: () => {
          setFormError("Could not save address. Please verify your PIN code and details.");
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

  const isSaving = createAddress.isPending || updateAddress.isPending;

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
          setFormError(null);
          onOpenChange(false);
        }
      }}
      title={title}
      description={description}
      className="max-w-lg p-6"
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
              disabled={!pendingAddressId}
              onPress={handleConfirmAddress}
              className={`rounded-xl px-5 py-2.5 ${
                pendingAddressId ? "bg-[#EA580C] active:bg-[#C2410C]" : "bg-warm-300 opacity-60"
              }`}
            >
              <Text className="text-sm font-bold text-white">Use this address</Text>
            </Pressable>
          </View>
        ) : (
          <View className="flex-row items-center justify-between gap-3 pt-2">
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setFormError(null);
                setMode("list");
              }}
              className="px-3 py-2"
            >
              <Text className="text-sm font-semibold text-text-secondary">
                Back to saved addresses
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              disabled={isSaving}
              onPress={handleSaveAddress}
              className="rounded-xl bg-[#EA580C] px-5 py-2.5 active:bg-[#C2410C] disabled:opacity-60"
            >
              {isSaving ? (
                <View className="flex-row items-center gap-2">
                  <Spinner size="sm" />
                  <Text className="text-sm font-bold text-white">Saving…</Text>
                </View>
              ) : (
                <Text className="text-sm font-bold text-white">Save address</Text>
              )}
            </Pressable>
          </View>
        )
      }
    >
      <ScrollView
        style={{ maxHeight: Math.min(windowHeight * 0.58, 480) }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {mode === "list" ? (
          <View className="gap-3 pb-2">
            {/* List of saved addresses matching Image 2 */}
            <View className="gap-2">
              {addresses.length === 0 ? (
                <View className="rounded-2xl border border-dashed border-line bg-surface-sunken p-4 items-center justify-center my-1">
                  <Text className="text-sm font-semibold text-navy-950">No saved addresses yet</Text>
                  <Text className="mt-1 text-xs text-text-secondary text-center leading-relaxed">
                    Use your current location or add a new address below to proceed.
                  </Text>
                </View>
              ) : (
                // Render list of available customer saved addresses
                addresses.map((address) => {
                  const isSelected = address.id === pendingAddressId;
                  return (
                    <Pressable
                      key={address.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                      onPress={() => setPendingAddressId(address.id)}
                      className={`flex-row items-start justify-between rounded-2xl border p-4 ${
                        isSelected
                          ? "border-[#EA580C] bg-[#FFF8F3]"
                          : "border-line bg-surface active:bg-surface-sunken"
                      }`}
                    >
                      <View className="min-w-0 flex-1">
                        <View className="flex-row items-center gap-2">
                          <Text className="text-sm font-bold text-navy-950">
                            {address.label}
                          </Text>
                          {address.is_default ? (
                            <Badge tone="neutral">Default</Badge>
                          ) : null}
                        </View>
                        <Text className="mt-1 text-sm font-normal text-text-secondary">
                          {address.line1}
                          {address.locality ? `, ${address.locality}` : ""}
                        </Text>
                        <Text className="mt-0.5 text-xs font-semibold text-text-muted">
                          PIN {address.postal_code}
                        </Text>
                      </View>

                      <Pressable
                        accessibilityRole="button"
                        onPress={() => {
                          setEditingAddress(address);
                          setLabel(address.label || "Home");
                          setLine1(address.line1 || "");
                          setLocality(address.locality || "");
                          setCity(address.city || "Hyderabad");
                          setPostal(address.postal_code || "");
                          setLatitude(address.latitude ? String(address.latitude) : "");
                          setLongitude(address.longitude ? String(address.longitude) : "");
                          setFormError(null);
                          setMode("edit");
                        }}
                        className="px-2 py-1"
                      >
                        <Text className="text-sm font-semibold text-navy-900">Edit</Text>
                      </Pressable>
                    </Pressable>
                  );
                })
              )}
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
                  setEditingAddress(null);
                  setLabel("Home");
                  setLine1("");
                  setLocality("");
                  setCity("Hyderabad");
                  setPostal("");
                  setLatitude("");
                  setLongitude("");
                  setFormError(null);
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
              <Input
                value={label}
                onChangeText={(val) => {
                  setLabel(val);
                  setFormError(null);
                }}
                placeholder="Home"
              />
            </View>

            <View>
              <Text className="text-xs font-semibold text-text-secondary mb-1">
                House, flat or building *
              </Text>
              <Input
                value={line1}
                onChangeText={(val) => {
                  setLine1(val);
                  setFormError(null);
                }}
                placeholder="Flat 402, Royal Palms"
              />
            </View>

            <View>
              <Text className="text-xs font-semibold text-text-secondary mb-1">Locality</Text>
              <Input
                value={locality}
                onChangeText={(val) => {
                  setLocality(val);
                  setFormError(null);
                }}
                placeholder="Khajaguda, Gachibowli"
              />
            </View>

            <View className="flex-row gap-3">
              <View className="flex-1">
                <Text className="text-xs font-semibold text-text-secondary mb-1">City</Text>
                <Input
                  value={city}
                  onChangeText={(val) => {
                    setCity(val);
                    setFormError(null);
                  }}
                  placeholder="Hyderabad"
                />
              </View>
              <View className="flex-1">
                <Text className="text-xs font-semibold text-text-secondary mb-1">PIN code *</Text>
                <Input
                  value={postal}
                  onChangeText={(val) => {
                    setPostal(val);
                    setFormError(null);
                  }}
                  placeholder="500032"
                  keyboardType="numeric"
                  maxLength={6}
                />
              </View>
            </View>

            {formError ? (
              <View className="rounded-xl border border-red-200 bg-red-50 p-3">
                <Text className="text-xs font-medium text-red-700">{formError}</Text>
              </View>
            ) : null}
          </View>
        )}
      </ScrollView>
    </Dialog>
  );
}
