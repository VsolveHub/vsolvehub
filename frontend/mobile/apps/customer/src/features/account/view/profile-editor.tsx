// Ported from frontend/apps/customer/features/account/view/profile-editor.tsx
import { describeError } from "@vsolve/query/native";
import { Button, ErrorState, Input, Spinner, Text } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";

import { useCustomerProfile, useUpdateCustomerProfile } from "@/features/account/queries";

export function ProfileEditor() {
  const router = useRouter();
  const profile = useCustomerProfile();
  const update = useUpdateCustomerProfile();
  const [fullName, setFullName] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await profile.refetch();
    setRefreshing(false);
  };

  if (profile.isPending) {
    return (
      <View className="flex-1 items-center justify-center">
        <Spinner size="sm" />
      </View>
    );
  }
  if (profile.isError || !profile.data) {
    return (
      <View className="flex-1 bg-canvas px-4 py-6">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to Profile"
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.push("/account");
            }
          }}
          className="mb-4 size-9 items-center justify-center rounded-full border border-line bg-surface shadow-2xs active:bg-surface-hover"
        >
          <ChevronLeft size={18} color="#00112e" />
        </Pressable>
        <ErrorState
          title="We could not load your profile"
          message="Check your connection and try again."
          actionLabel="Try again"
          onAction={() => void profile.refetch()}
        />
      </View>
    );
  }
  const person = profile.data;
  return (
    <ScrollView
      className="flex-1 bg-canvas"
      contentContainerClassName="gap-3 px-4 py-6"
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#EA580C"]} tintColor="#EA580C" />
      }
    >
      <View className="flex-row items-center gap-2.5">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to Profile"
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.push("/account");
            }
          }}
          className="size-9 items-center justify-center rounded-full border border-line bg-surface shadow-2xs active:bg-surface-hover"
        >
          <ChevronLeft size={18} color="#00112e" />
        </Pressable>
        <Text className="text-2xl font-extrabold text-text">Edit profile</Text>
      </View>
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
    </ScrollView>
  );
}
