// Ported from frontend/apps/partner/features/session/partner-shell.tsx
import type { ReactNode } from "react";
import { View } from "react-native";

import { Button, Card, ErrorState, Text } from "@vsolve/mobile-ui";

export type GuardBranch =
  | "checking"
  | "signin"
  | "error"
  | "selecting"
  | "switch"
  | "no-access"
  | "approval-pending"
  | "approval-unknown"
  | "leaving"
  | "ready";

export function PartnerGuardView({
  branch,
  onRetry,
  onSwitch,
  onSignOut,
  onApply,
  switching,
  children,
}: {
  branch: GuardBranch;
  onRetry?: () => void;
  onSwitch?: () => void;
  onSignOut?: () => void;
  onApply?: () => void;
  switching?: boolean;
  children?: ReactNode;
}) {
  if (branch === "ready") return <>{children}</>;
  if (branch === "checking" || branch === "approval-pending") {
    return <Text className="px-4 py-16 text-text-secondary">Checking your access…</Text>;
  }
  if (branch === "signin") {
    return <Text className="px-4 py-16 text-text-secondary">Taking you to sign in…</Text>;
  }
  if (branch === "selecting") {
    return <Text className="px-4 py-16 text-text-secondary">Opening your account…</Text>;
  }
  if (branch === "leaving") {
    return <Text className="px-4 py-16 text-text-secondary">Taking you to your application…</Text>;
  }
  if (branch === "error" || branch === "approval-unknown") {
    return (
      <View className="px-4 py-16">
        <ErrorState
          title={branch === "error" ? "We could not check your access" : "We could not check your account"}
          message="Nothing has changed. Check your connection and try again."
          actionLabel="Try again"
          onAction={onRetry}
        />
      </View>
    );
  }
  if (branch === "switch") {
    return (
      <View className="px-4 py-16">
        <Card className="p-6">
          <Text className="text-lg font-bold text-text">Switch to your Partner account</Text>
          <Text className="mt-2 text-sm text-text-secondary">
            You are signed in with a different role. Switch to Partner to see the work being offered to you.
          </Text>
          <Button className="mt-6" loading={switching} loadingLabel="Switching" onPress={onSwitch}>
            Switch to Partner
          </Button>
          <Button variant="ghost" className="mt-3" onPress={onSignOut}>
            Sign in as someone else
          </Button>
        </Card>
      </View>
    );
  }
  return (
    <View className="px-4 py-16">
      <Card className="p-6">
        <Text className="text-lg font-bold text-text">You do not have a Partner account</Text>
        <Text className="mt-2 text-sm text-text-secondary">
          This part of the app is for people who work through Vsolve Hub. Applying takes a few minutes and does not commit you to anything.
        </Text>
        <Button className="mt-6" onPress={onApply}>
          Become a Partner
        </Button>
        <Button variant="ghost" className="mt-3" onPress={onSignOut}>
          Sign out
        </Button>
      </Card>
    </View>
  );
}
