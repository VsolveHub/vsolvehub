import { Redirect } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Header,
  Input,
  Screen,
  Text,
} from "@vsolve/mobile-ui";

export default function UiGallery() {
  const [name, setName] = useState("");
  if (!__DEV__) return <Redirect href="/" />;
  return (
    <Screen scroll>
      <Header title="UI gallery" />
      <View className="gap-4 p-4">
        <Text className="text-base font-semibold text-text">Buttons</Text>
        <Button>Continue</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">Danger</Button>
        <Button loading loadingLabel="Saving">Save</Button>
        <Card>
          <Text className="text-sm font-semibold text-text">Card</Text>
          <Badge tone="success" dot>Paid</Badge>
        </Card>
        <Field label="Name" required>
          <Input value={name} onChangeText={setName} placeholder="Your name" />
        </Field>
        <ErrorState title="Payment did not go through" message="Nothing was charged." actionLabel="Try again" onAction={() => undefined} />
        <EmptyState title="No bookings yet" description="Accepted work will show up here." />
      </View>
    </Screen>
  );
}
