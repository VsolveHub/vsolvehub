// Ported from frontend/apps/partner/features/session/partner-shell.tsx
import type { ReactNode } from "react";
import { View } from "react-native";

import { Button, Card, ErrorState, Text, useT } from "@vsolve/mobile-ui";

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
  const t = useT();

  if (branch === "ready") return <>{children}</>;
  if (branch === "checking" || branch === "approval-pending") {
    return <Text className="px-4 py-16 text-text-secondary">{t("common.checkingAccess")}</Text>;
  }
  if (branch === "signin") {
    return <Text className="px-4 py-16 text-text-secondary">{t("common.takingYouToSignIn")}</Text>;
  }
  if (branch === "selecting") {
    return <Text className="px-4 py-16 text-text-secondary">{t("common.openingYourAccount")}</Text>;
  }
  if (branch === "leaving") {
    return <Text className="px-4 py-16 text-text-secondary">{t("common.takingYouToYourApplication")}</Text>;
  }
  if (branch === "error" || branch === "approval-unknown") {
    return (
      <View className="px-4 py-16">
        <ErrorState
          title={branch === "error" ? t("common.couldNotCheckAccess") : t("common.couldNotCheckAccount")}
          message={t("common.nothingChanged")}
          actionLabel={t("common.tryAgain")}
          onAction={onRetry}
        />
      </View>
    );
  }
  if (branch === "switch") {
    return (
      <View className="px-4 py-16">
        <Card className="p-6">
          <Text className="text-lg font-bold text-text">{t("shell.switchToPartner.title")}</Text>
          <Text className="mt-2 text-sm text-text-secondary">
            {t("common.differentRoleMessage")}
          </Text>
          <Button
            className="mt-6"
            loading={switching}
            loadingLabel={t("common.switchingToPartner")}
            onPress={onSwitch}
          >
            {t("common.switchToPartner")}
          </Button>
          <Button variant="ghost" className="mt-3" onPress={onSignOut}>
            {t("common.signInAsSomeoneElse")}
          </Button>
        </Card>
      </View>
    );
  }
  return (
    <View className="px-4 py-16">
      <Card className="p-6">
        <Text className="text-lg font-bold text-text">{t("common.noPartnerAccountTitle")}</Text>
        <Text className="mt-2 text-sm text-text-secondary">
          {t("common.noPartnerAccountMessage")}
        </Text>
        <Button className="mt-6" onPress={onApply}>
          {t("common.becomeAPartner")}
        </Button>
        <Button variant="ghost" className="mt-3" onPress={onSignOut}>
          {t("common.signOut")}
        </Button>
      </Card>
    </View>
  );
}
