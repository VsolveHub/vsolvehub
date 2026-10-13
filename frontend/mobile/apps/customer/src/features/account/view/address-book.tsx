// Ported from frontend/apps/customer/features/addresses/view/address-book.tsx
// Exact match with Image 2 (Saved addresses tab)
import { describeError } from "@vsolve/query/native";
import { Badge, Button, ConfirmAction, Dialog, ErrorState, Field, Input, Spinner, Text } from "@vsolve/mobile-ui";
import * as Location from "expo-location";
import { useState } from "react";
import { Pressable, View } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";

import { useAddresses, useArchiveAddress, useCreateAddress, useReverseGeocode, type Address, type AddressInput } from "@/features/addresses/queries";
import { AccountPageShell } from "./account-page-shell";

export function AddressBook() {
  const addressesQuery = useAddresses();
  const createAddress = useCreateAddress();
  const archiveAddress = useArchiveAddress();
  const geocode = useReverseGeocode();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<Address | null>(null);

  // Form states
  const [label, setLabel] = useState("Home");
  const [line1, setLine1] = useState("");
  const [locality, setLocality] = useState("");
  const [city, setCity] = useState("");
  const [postal, setPostal] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");

  const [refreshing, setRefreshing] = useState(false);

  const addresses = addressesQuery.data ?? [];

  const onRefresh = async () => {
    setRefreshing(true);
    await addressesQuery.refetch();
    setRefreshing(false);
  };

  async function handleLocate() {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") return;
      const pos = await Location.getCurrentPositionAsync({});
      const lat = String(pos.coords.latitude);
      const lng = String(pos.coords.longitude);
      setLatitude(lat);
      setLongitude(lng);
      geocode.mutate(
        { latitude: lat, longitude: lng },
        {
          onSuccess: (found) => {
            setLine1(found.line1);
            setLocality(found.locality);
            setCity(found.city);
            setPostal(found.postal_code);
          },
        },
      );
    } catch {
      // ignore
    }
  }

  function handleSaveAddress() {
    if (!line1 || !locality || !city || !postal) return;
    createAddress.mutate(
      {
        label: label || "Saved address",
        line1,
        locality: locality || "Hyderabad",
        city: city || "Hyderabad",
        state: "Telangana",
        postal_code: postal.replace(/\D/g, "").slice(0, 6) || "500032",
        country_code: "IN",
        latitude: latitude || "17.414053",
        longitude: longitude || "78.353554",
        source: latitude ? "REVERSE_GEOCODED" : "MANUAL",
        is_default: addresses.length === 0,
      } as AddressInput,
      {
        onSuccess: () => {
          setDialogOpen(false);
          setLine1("");
          setLocality("");
          setCity("");
          setPostal("");
          void addressesQuery.refetch();
        },
      },
    );
  }

  return (
    <AccountPageShell activeTab="addresses" onRefresh={onRefresh} refreshing={refreshing}>
      <View className="overflow-hidden rounded-2xl border border-line bg-surface p-5 shadow-xs">
        {/* Section Header matching Image 2 */}
        <View className="mb-4 flex-row items-start justify-between gap-3">
          <View className="min-w-0 flex-1">
            <View className="flex-row items-center gap-2.5">
              <View className="size-9 shrink-0 items-center justify-center rounded-full bg-[#FFF4EC]">
                <Svg
                  viewBox="0 0 24 24"
                  width={18}
                  height={18}
                  fill="none"
                  stroke="#EA580C"
                  strokeWidth={2.2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <Path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                  <Circle cx={12} cy={10} r={3} />
                </Svg>
              </View>
              <Text className="text-lg font-extrabold text-navy-900">Saved addresses</Text>
            </View>
            <Text className="mt-2 text-sm leading-relaxed text-text-secondary">
              Where we send someone when you book. Pick one at checkout instead of typing it again.
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setLabel("Home");
              setLine1("");
              setLocality("");
              setCity("");
              setPostal("");
              setDialogOpen(true);
            }}
            className="h-10 shrink-0 flex-row items-center gap-1 rounded-full border border-[#EA580C] bg-white px-3.5 shadow-2xs active:bg-[#FFF8F3]"
          >
            <Svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="#EA580C" strokeWidth={2.4}>
              <Path d="M5 12h14m-7-7v14" />
            </Svg>
            <Text className="text-sm font-bold text-[#EA580C]">Add address</Text>
          </Pressable>
        </View>

        {addressesQuery.isPending ? (
          <View className="py-8 items-center justify-center">
            <Spinner size="sm" />
          </View>
        ) : addressesQuery.isError ? (
          <ErrorState
            title="We could not load your addresses"
            message={describeError(addressesQuery.error, "read").message}
            actionLabel="Try again"
            onAction={() => void addressesQuery.refetch()}
          />
        ) : (
          <View className="mt-4 gap-4">
            {addresses.map((address, index) => {
              const isDefault = address.is_default || index === 0;
              const formattedAddress = [
                address.line1,
                address.locality,
                address.city,
                address.postal_code,
              ]
                .filter(Boolean)
                .join(", ");

              return (
                <View
                  key={address.id}
                  className="overflow-hidden rounded-2xl border border-[#ece7e0] bg-white shadow-xs"
                >
                  <View className="flex-row items-start gap-3.5 p-4">
                    {/* Peach circle glyph with Orange House icon */}
                    <View className="mt-0.5 size-11 shrink-0 items-center justify-center rounded-full bg-[#FFF4EC]">
                      <Svg
                        viewBox="0 0 24 24"
                        width={20}
                        height={20}
                        fill="none"
                        stroke="#EA580C"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <Path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                        <Path d="M9 22V12h6v10" />
                      </Svg>
                    </View>

                    <View className="min-w-0 flex-1">
                      <View className="flex-row items-center justify-between gap-2">
                        <View className="flex-row items-center gap-2">
                          <Text className="text-base font-extrabold text-navy-900">
                            {address.label || "Saved address"}
                          </Text>
                          {isDefault ? (
                            <View className="rounded-md bg-[#EFF6FF] px-2 py-0.5">
                              <Text className="text-xs font-bold text-[#1D4ED8]">Default</Text>
                            </View>
                          ) : null}
                        </View>
                        {/* More menu icon */}
                        <Pressable className="size-8 items-center justify-center rounded-full">
                          <Svg viewBox="0 0 24 24" width={18} height={18} fill="#6B6560">
                            <Circle cx={12} cy={5} r={2} />
                            <Circle cx={12} cy={12} r={2} />
                            <Circle cx={12} cy={19} r={2} />
                          </Svg>
                        </Pressable>
                      </View>

                      <Text className="mt-1 text-sm leading-relaxed text-text-secondary">
                        {formattedAddress}
                      </Text>
                    </View>
                  </View>

                  {/* Split Action Footer matching Image 2 */}
                  <View className="flex-row border-t border-[#ece7e0]">
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        setLabel(address.label || "Home");
                        setLine1(address.line1);
                        setLocality(address.locality);
                        setCity(address.city);
                        setPostal(address.postal_code);
                        setDialogOpen(true);
                      }}
                      className="h-11 flex-1 flex-row items-center justify-center gap-1.5 border-r border-[#ece7e0] active:bg-[#FAF9F7]"
                    >
                      <Svg
                        viewBox="0 0 24 24"
                        width={15}
                        height={15}
                        fill="none"
                        stroke="#071328"
                        strokeWidth={2.2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <Path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                      </Svg>
                      <Text className="text-sm font-bold text-navy-900">Edit</Text>
                    </Pressable>

                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setDeleteCandidate(address)}
                      className="h-11 flex-1 flex-row items-center justify-center gap-1.5 active:bg-red-50"
                    >
                      <Svg
                        viewBox="0 0 24 24"
                        width={15}
                        height={15}
                        fill="none"
                        stroke="#DC2626"
                        strokeWidth={2.2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <Path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </Svg>
                      <Text className="text-sm font-bold text-red-600">Delete</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}

            {/* Blue Info Banner matching Image 2 */}
            <View className="mt-1 flex-row items-center gap-3 rounded-2xl border border-[#dbeafe] bg-[#eff6ff] p-3.5">
              <View className="size-8 shrink-0 items-center justify-center rounded-full bg-white shadow-2xs">
                <Svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="#2563eb" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round">
                  <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <Path d="m9 12 2 2 4-4" />
                </Svg>
              </View>
              <Text className="min-w-0 flex-1 text-sm leading-relaxed text-[#1e40af]">
                Your default address will be used for faster checkout.
              </Text>
            </View>

            {/* Peach Promo Card matching Image 2 */}
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setLabel("Home");
                setLine1("");
                setLocality("");
                setCity("");
                setPostal("");
                setDialogOpen(true);
              }}
              className="mt-1 flex-row items-center gap-3 rounded-2xl border border-[#fde8d4] bg-[#FFF6EE] p-4 active:bg-[#FFEFDF]"
            >
              <View className="size-10 shrink-0 items-center justify-center rounded-full bg-white shadow-xs">
                <Svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="#EA580C" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round">
                  <Path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                  <Circle cx={12} cy={10} r={3} />
                </Svg>
              </View>
              <View className="min-w-0 flex-1">
                <Text className="text-sm font-extrabold text-navy-900">Add more addresses</Text>
                <Text className="mt-0.5 text-xs leading-relaxed text-text-secondary">
                  Save multiple addresses and choose the one that works best for you.
                </Text>
              </View>
              {/* House Artwork Illustration matching Image 2 */}
              <Svg viewBox="0 0 88 72" width={68} height={56}>
                <Rect x={18} y={28} width={48} height={32} rx={4} fill="#FFE8D4" />
                <Path d="M14 32 42 12l28 20" fill="#FDBA8C" />
                <Rect x={36} y={42} width={12} height={18} rx={1.5} fill="#EA580C" />
                <Circle cx={64} cy={18} r={12} fill="#EA580C" />
                <Path d="M64 11.5c-3.2 0-5.8 2.5-5.8 5.6 0 4.2 5.8 10.4 5.8 10.4s5.8-6.2 5.8-10.4c0-3.1-2.6-5.6-5.8-5.6Z" fill="white" />
                <Circle cx={64} cy={17.1} r={2.1} fill="#EA580C" />
              </Svg>
            </Pressable>
          </View>
        )}

        {/* Delete Confirmation */}
        <ConfirmAction
          open={deleteCandidate !== null}
          onOpenChange={(open) => !open && setDeleteCandidate(null)}
          title="Delete this address?"
          consequence="You can add it again at checkout if you need it."
          confirmLabel="Delete address"
          pending={archiveAddress.isPending}
          destructive
          onConfirm={() => {
            if (deleteCandidate) {
              archiveAddress.mutate(deleteCandidate.id, {
                onSuccess: () => {
                  setDeleteCandidate(null);
                  void addressesQuery.refetch();
                },
              });
            }
          }}
        />

        {/* Add / Edit Dialog */}
        <Dialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          title="Save an address"
          description="Where we send someone when you book."
        >
          <View className="gap-3 py-2">
            <Button variant="outline" size="sm" onPress={handleLocate}>
              📍 Use my current location
            </Button>
            <Field label="Label" showOptional={false}>
              <Input placeholder="Home, Office, etc." value={label} onChangeText={setLabel} />
            </Field>
            <Field label="Address line" required>
              <Input placeholder="House / Flat no., building, street" value={line1} onChangeText={setLine1} />
            </Field>
            <Field label="Locality / Area" required>
              <Input placeholder="Locality or landmark" value={locality} onChangeText={setLocality} />
            </Field>
            <Field label="City" required>
              <Input placeholder="City" value={city} onChangeText={setCity} />
            </Field>
            <Field label="Pincode" required>
              <Input placeholder="6-digit pincode" value={postal} onChangeText={setPostal} keyboardType="number-pad" />
            </Field>
            <View className="mt-2 flex-row justify-end gap-2">
              <Button variant="ghost" onPress={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onPress={handleSaveAddress} loading={createAddress.isPending}>
                Save address
              </Button>
            </View>
          </View>
        </Dialog>
      </View>
    </AccountPageShell>
  );
}
