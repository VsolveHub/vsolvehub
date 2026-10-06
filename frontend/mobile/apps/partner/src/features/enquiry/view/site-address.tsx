// Ported from frontend/apps/partner/features/visit/view/site-address.tsx
import type { Schemas } from "@vsolve/api-client";
import { Card, Text, buttonStyles } from "@vsolve/mobile-ui";
import { LockKeyhole, MapPin, Navigation } from "lucide-react-native";
import { Linking, Pressable, View } from "react-native";

export interface SiteAddressProps {
  readonly address: Schemas["PartnerSiteAddress"] | null;
  readonly approximateArea: string;
}

export function SiteAddress({ address, approximateArea }: SiteAddressProps) {
  if (address === null) {
    return (
      <Card className="flex-row items-start gap-3 p-4">
        <View className="h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-sunken">
          <LockKeyhole size={19} color="#00246b" />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-bold text-text">Visit location</Text>
          {approximateArea.trim() === "" ? null : (
            <View className="mt-1 flex-row items-center gap-1.5">
              <MapPin size={15} color="#453f37" />
              <Text numberOfLines={1} className="text-sm font-semibold text-text-secondary">Near {approximateArea}</Text>
            </View>
          )}
          <Text className="mt-1 text-xs leading-5 text-text-muted">
            Exact address appears after customer payment confirms the visit. Do not travel while this visit is on hold.
          </Text>
        </View>
      </Card>
    );
  }

  const localityLine = [address.locality, address.city, address.postal_code].filter((part) => part.trim() !== "").join(", ");
  const destination = [address.line1, address.line2, address.landmark, address.locality, address.city, address.postal_code]
    .filter((part) => part.trim() !== "")
    .join(", ");
  const mapsHref = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;

  return (
    <Card className="flex-row items-start gap-3 border-success-line p-4">
      <View className="h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-success-surface">
        <MapPin size={20} color="#166534" />
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-sm font-bold text-text">Site address</Text>
        <Text className="mt-1 text-sm font-semibold leading-6 text-text">{address.line1}</Text>
        {address.line2.trim() === "" ? null : <Text className="text-sm leading-6 text-text">{address.line2}</Text>}
        {address.landmark.trim() === "" ? null : <Text className="text-sm leading-6 text-text">Near {address.landmark}</Text>}
        {localityLine === "" ? null : <Text className="text-sm leading-6 text-text">{localityLine}</Text>}
        {address.state.trim() === "" ? null : <Text className="text-sm leading-6 text-text">{address.state}</Text>}
        <Pressable accessibilityRole="button" className={buttonStyles({ variant: "outline", className: "mt-3 w-full" })} onPress={() => void Linking.openURL(mapsHref)}>
          <Navigation size={16} color="#00112e" />
          <Text className="text-sm font-semibold text-text">Open route in Maps</Text>
        </Pressable>
      </View>
    </Card>
  );
}
