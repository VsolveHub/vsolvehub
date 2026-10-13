// Ported from frontend/apps/customer/features/crew/view/crew-address-picker.tsx
import { describeError } from "@vsolve/query/native";
import type { Schemas } from "@vsolve/api-client";
import { Button, Input, Sheet, Text } from "@vsolve/mobile-ui";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";

import {
  coordsOnlyAddress,
  getDevicePosition,
  locateErrorMessage,
} from "@/features/addresses/locate-device";
import { useAddresses, useCreateAddress, useReverseGeocode } from "@/features/addresses/queries";

type Address = Schemas["Address"];

export function CrewAddressPicker({
  selectedAddressId,
  onSelect,
  openSignal = 0,
}: {
  variantId: string;
  selectedAddressId: string | null;
  onSelect: (addressId: string) => void;
  presentation?: "card" | "row" | "none";
  openSignal?: number;
  onResolved?: (address: Address | null) => void;
}) {
  const addressesQuery = useAddresses();
  const addresses = addressesQuery.data ?? [];
  const createAddress = useCreateAddress();
  const reverseGeocode = useReverseGeocode();
  const [open, setOpen] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [line1, setLine1] = useState("");
  const [locality, setLocality] = useState("");
  const [city, setCity] = useState("");
  const [stateName, setStateName] = useState("");
  const [postal, setPostal] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");

  useEffect(() => {
    if (openSignal > 0) setOpen(true);
  }, [openSignal]);

  async function locate() {
    setLocationError(null);
    try {
      const position = await getDevicePosition();
      const lat = position.coords.latitude.toFixed(6);
      const lng = position.coords.longitude.toFixed(6);
      try {
        const found = await reverseGeocode.mutateAsync({ latitude: lat, longitude: lng });
        setLine1(found.line1);
        setLocality(found.locality);
        setCity(found.city);
        setStateName(found.state);
        setPostal(found.postal_code);
        setLatitude(found.latitude);
        setLongitude(found.longitude);
      } catch {
        const coords = coordsOnlyAddress(lat, lng);
        setLatitude(coords.latitude);
        setLongitude(coords.longitude);
      }
    } catch (error) {
      setLocationError(locateErrorMessage(error));
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen} title="Where">
      <View className="gap-3">
        {addressesQuery.isPending ? <Text className="text-sm text-text-secondary">Loading your addresses</Text> : null}
        {addresses.map((address) => (
          <Pressable
            key={address.id}
            accessibilityRole="button"
            onPress={() => {
              onSelect(address.id);
              setOpen(false);
            }}
            className={
              address.id === selectedAddressId
                ? "rounded-card border border-selected bg-selected-surface px-3 py-3"
                : "rounded-card border border-line bg-surface px-3 py-3"
            }
          >
            <Text className="text-sm font-semibold text-text">{address.label}</Text>
            <Text className="text-sm text-text-secondary">
              {[address.locality || address.city, address.postal_code].filter(Boolean).join(" — ")}
            </Text>
          </Pressable>
        ))}
        <Button variant="secondary" loading={reverseGeocode.isPending} onPress={() => void locate()}>
          Use my location
        </Button>
        {locationError ? <Text className="text-sm text-danger-text">{locationError}</Text> : null}
        <Input value={line1} onChangeText={setLine1} placeholder="Street" />
        <Input value={locality} onChangeText={setLocality} placeholder="Locality" />
        <Input value={city} onChangeText={setCity} placeholder="City" />
        <Input value={stateName} onChangeText={setStateName} placeholder="State" />
        <Input value={postal} onChangeText={setPostal} placeholder="Postal code" keyboardType="number-pad" />
        {createAddress.error ? (
          <Text className="text-sm text-danger-text">{describeError(createAddress.error, "mutation").message}</Text>
        ) : null}
        <Button
          loading={createAddress.isPending}
          loadingLabel="Saving"
          onPress={() =>
            createAddress.mutate(
              {
                label: "Saved address",
                line1,
                locality: locality || city || "Hyderabad",
                city: city || "Hyderabad",
                state: stateName || "Telangana",
                postal_code: postal.replace(/\D/g, "").slice(0, 6) || "500032",
                latitude: latitude || "17.414053",
                longitude: longitude || "78.353554",
                source: latitude ? "REVERSE_GEOCODED" : "MANUAL",
                country_code: "IN",
                is_default: addresses.length === 0,
              },
              {
                onSuccess: (created) => {
                  onSelect(created.id);
                  setOpen(false);
                },
              },
            )
          }
        >
          Save address
        </Button>
      </View>
    </Sheet>
  );
}
