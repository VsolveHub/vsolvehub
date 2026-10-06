// Ported from frontend/apps/customer/features/account/view/profile-editor.tsx
import { describeError } from "@vsolve/query/native";
import { Button, ErrorState, Input, Spinner, Text } from "@vsolve/mobile-ui";
import { useState } from "react";
import { View } from "react-native";

import { useCustomerProfile, useUpdateCustomerProfile } from "@/features/account/queries";

export function ProfileEditor() {
  const profile = useCustomerProfile();
  const update = useUpdateCustomerProfile();
  const [fullName, setFullName] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  if (profile.isPending) {
    return (
      <View className="flex-1 items-center justify-center">
        <Spinner size="sm" />
      </View>
    );
  }
  if (profile.isError || !profile.data) {
    return <ErrorState title="We could not load your profile" message="Check your connection and try again." actionLabel="Try again" onAction={() => void profile.refetch()} />;
  }
  const person = profile.data;
  return (
    <View className="flex-1 gap-3 bg-canvas px-4 py-6">
      <Text className="text-2xl font-extrabold text-text">Edit profile</Text>
      <Input value={fullName ?? person.full_name} onChangeText={setFullName} placeholder="Full name" />
      <Input value={displayName ?? person.display_name} onChangeText={setDisplayName} placeholder="Display name" />
      <Input value={email ?? person.email} onChangeText={setEmail} placeholder="Email" keyboardType="email-address" autoCapitalize="none" />
      <Text className="text-sm text-text-secondary">{person.phone_number}</Text>
      {update.error ? <Text className="text-sm text-danger-text">{describeError(update.error, "mutation").message}</Text> : null}
      <Button
        loading={update.isPending}
        loadingLabel="Saving"
        onPress={() =>
          update.mutate({
            full_name: fullName ?? person.full_name,
            display_name: displayName ?? person.display_name,
            email: email ?? person.email,
          })
        }
      >
        Save
      </Button>
    </View>
  );
}
