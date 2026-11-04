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
import { PlaceSearch } from "@/features/addresses/view/place-search";

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

  /** Put the pin here and describe it with Django's reverse geocode, as the web does. */
  async function placePin(lat: string, lng: string) {
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
  }

  async function locate() {
    setLocationError(null);
    try {
      const position = await getDevicePosition();
      await placePin(position.coords.latitude.toFixed(6), position.coords.longitude.toFixed(6));
    } catch (error) {
      setLocationError(locateErrorMessage(error));
    }
  }

  // A saved address is where the crew is sent: a real pin and real fields, never a default (it
  // used to fall back to a fixed Hyderabad pin and PIN code).
  const postalDigits = postal.replace(/\D/g, "").slice(0, 6);
  const canSave =
    latitude !== "" && longitude !== "" && line1.trim() !== "" && city.trim() !== "" &&
    stateName.trim() !== "" && postalDigits.length === 6;

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
        <PlaceSearch onPick={(place) => void placePin(place.latitude, place.longitude)} />
        <Button variant="secondary" loading={reverseGeocode.isPending} onPress={() => void locate()}>
          Use my location
        </Button>
        {latitude === "" ? (
          <Text className="text-xs text-text-secondary">
            Search for the place or use your location to put the pin on the door.
          </Text>
        ) : null}
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
          disabled={!canSave}
          onPress={() =>
            createAddress.mutate(
              {
                label: "Saved address",
                line1: line1.trim(),
                locality: locality.trim() || city.trim(),
                city: city.trim(),
                state: stateName.trim(),
                postal_code: postalDigits,
                latitude,
                longitude,
                source: "REVERSE_GEOCODED",
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
