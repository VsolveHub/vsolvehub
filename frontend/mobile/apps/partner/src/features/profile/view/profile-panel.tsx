// Ported from frontend/apps/partner/features/profile/view/profile-panel.tsx
import { describeError } from "@vsolve/query/native";
import { Button, Card, Dialog, ErrorState, Input, Skeleton, Text } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, View } from "react-native";

import { isNoProfileYet, usePartnerProfile, useUpdatePartnerProfile } from "../queries";

const APPROVAL_COPY: Record<string, { title: string; body: string }> = {
  APPROVED: {
    title: "You can take jobs",
    body: "Your account is approved. Go online to start getting offers.",
  },
  SUBMITTED: {
    title: "We are checking your details",
    body: "Nothing to do right now. We will tell you as soon as this is done.",
  },
  UNDER_REVIEW: {
    title: "We are checking your details",
    body: "Nothing to do right now. We will tell you as soon as this is done.",
  },
  CHANGES_REQUIRED: {
    title: "We need something from you",
    body: "Open your application to see what to fix. You cannot get jobs until this is done.",
  },
  DRAFT: {
    title: "Your application is not finished",
    body: "Finish it to start getting jobs.",
  },
  REJECTED: {
    title: "This account cannot take jobs",
    body: "Contact support if you think this is wrong.",
  },
};

export function ProfilePanel() {
  const router = useRouter();
  const profileQuery = usePartnerProfile();
  const updateName = useUpdatePartnerProfile();
  const [isEditingName, setIsEditingName] = useState(false);
  const [name, setName] = useState("");

  if (profileQuery.isPending) {
    return (
      <View className="gap-4 px-4 py-6">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </View>
    );
  }
  if (profileQuery.isError) {
    if (isNoProfileYet(profileQuery.error)) {
      return (
        <ErrorState
          title="You do not have a Partner profile yet"
          message="Finish your application and we will set one up."
          actionLabel="Open my application"
          onAction={() => router.push("/apply")}
        />
      );
    }
    return (
      <ErrorState
        title="We could not load your profile"
        message={describeError(profileQuery.error, "read").message}
        actionLabel="Try again"
        onAction={() => void profileQuery.refetch()}
      />
    );
  }

  const profile = profileQuery.data;
  const status = profile.approval_status ? (APPROVAL_COPY[profile.approval_status] ?? null) : null;

  return (
    <ScrollView className="flex-1 bg-canvas" contentContainerClassName="gap-4 px-4 py-6">
      <Card className="flex-row items-center gap-4 bg-navy-900 p-5">
        <View className="h-16 w-16 items-center justify-center rounded-[20px] bg-navy-500">
          <Text className="text-2xl font-bold text-white">{profile.display_name.charAt(0).toUpperCase() || "P"}</Text>
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-lg font-bold text-white">{profile.display_name}</Text>
          <Text className="mt-0.5 text-sm text-white">{profile.phone_number}</Text>
        </View>
        <Button
          variant="outline"
          onPress={() => {
            setName(profile.display_name);
            setIsEditingName(true);
          }}
        >
          Edit
        </Button>
      </Card>
      <Text className="px-1 text-xs text-text-secondary">
        To change your phone number, contact support — it is how you sign in, so we verify it before moving it.
      </Text>
      {status ? (
        <View className="rounded-card border border-line bg-surface p-5">
          <Text className="text-base font-bold text-text">{status.title}</Text>
          <Text className="mt-1 text-sm text-text-secondary">{status.body}</Text>
        </View>
      ) : null}
      <Card className="gap-4 p-5">
        <Fact label="What you do" value={profile.skills.length === 0 ? "Not set yet" : profile.skills.join(", ")} />
        <Fact label="Where you work" value={profile.service_areas.length === 0 ? "Not set yet" : profile.service_areas.join(", ")} />
        <Fact
          label="With us since"
          value={new Date(profile.member_since).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        />
        <Fact label="Getting paid" value={profile.has_payout_account ? "Your bank account is ready" : "No payout account yet"} />
      </Card>
      <Dialog
        open={isEditingName}
        onOpenChange={setIsEditingName}
        title="The name Customers see"
        footer={
          <Button
            loading={updateName.isPending}
            loadingLabel="Saving"
            onPress={() => {
              updateName.mutate(name.trim(), { onSuccess: () => setIsEditingName(false) });
            }}
          >
            Save
          </Button>
        }
      >
        <Input value={name} onChangeText={setName} maxLength={120} />
        {updateName.isError ? (
          <Text className="mt-2 text-sm text-danger-text">{describeError(updateName.error, "mutation").message}</Text>
        ) : null}
      </Dialog>
    </ScrollView>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text className="text-xs font-semibold text-text-muted">{label}</Text>
      <Text className="mt-1 text-sm text-text">{value}</Text>
    </View>
  );
}
