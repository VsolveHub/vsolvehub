import { Stack } from "expo-router";

export default function RidesLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTitle: "Rides",
        headerBackTitle: "Back",
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="choose-ride"
        options={{
          headerTitle: "Choose ride",
          headerBackTitle: "Back",
        }}
      />
      <Stack.Screen
        name="history"
        options={{
          headerTitle: "Your rides",
        }}
      />
      <Stack.Screen
        name="ride/[rideId]"
        options={{
          headerTitle: "Your ride",
          headerBackVisible: false,
          gestureEnabled: false,
        }}
      />
    </Stack>
  );
}
