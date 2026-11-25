import { Stack } from "expo-router";

import { ParcelDraftProvider } from "@/features/rides/parcel/draft";

/**
 * Pick up & Drop: Where should it go → Choose vehicle → Review → details. The provider keeps what
 * the customer has typed while they move between Review and the details screens, and forgets it
 * when they leave.
 */
export default function ParcelLayout() {
  return (
    <ParcelDraftProvider>
      <Stack screenOptions={{ headerShown: true, headerTitle: "Pick up & Drop", headerBackTitle: "Back" }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="choose" options={{ headerTitle: "Choose vehicle" }} />
        <Stack.Screen name="review" options={{ headerTitle: "Review" }} />
        <Stack.Screen name="contact" options={{ headerTitle: "Details" }} />
      </Stack>
    </ParcelDraftProvider>
  );
}
