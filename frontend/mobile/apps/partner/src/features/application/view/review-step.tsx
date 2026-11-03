// Ported from frontend/apps/partner/features/application/view/review-step.tsx
import { ApiRequestError } from "@vsolve/api-client";
import { ErrorState, Spinner } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import {
  Bell,
  CheckCircle2,
  FileCheck2,
  FileText,
  User,
} from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";

import { NotificationPermissionSheet } from "@/features/onboarding/components/notification-permission-sheet";
import { useApplyDock } from "../model/dock-context";
import { canSubmit, isEditable } from "../model/readiness";
import { isVersionConflict, usePartnerApplication, useSubmitApplication } from "../queries";

export function ReviewStep() {
  const router = useRouter();
  const query = usePartnerApplication();
  const submit = useSubmitApplication();
  const { registerDock } = useApplyDock();

  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [permissionSheetOpen, setPermissionSheetOpen] = useState(false);

  const isMissing = query.error instanceof ApiRequestError && query.error.status === 404;
  const application = query.data ?? null;
  const editable = application !== null && isEditable(application);
  const ready = application !== null && canSubmit(application);
  const appStatus = (application?.status as string) || "";
  const isSubmitted =
    appStatus === "SUBMITTED" ||
    appStatus === "UNDER_REVIEW" ||
    appStatus === "APPROVED" ||
    appStatus === "CHANGES_REQUIRED" ||
    appStatus === "REJECTED" ||
    appStatus === "DECLINED";

  // If already submitted, navigate directly to status screen
  useEffect(() => {
    if (isSubmitted) {
      router.replace("/apply/status" as any);
    }
  }, [isSubmitted, router]);

  const submitMutateRef = useRef(submit.mutate);
  submitMutateRef.current = submit.mutate;
  const refetchRef = useRef(query.refetch);
  refetchRef.current = query.refetch;

  const onCommit = useCallback(() => {
    submitMutateRef.current(undefined, {
      onSuccess: () => {
        void refetchRef.current();
        router.replace("/apply/status" as any);
      },
    });
  }, [router]);

  useEffect(() => {
    if (!editable) {
      registerDock(null);
      return;
    }

    registerDock({
      label: "Submit application",
      backHref: "/apply/documents",
      nextStepName: null,
      onCommit,
      isSaving: submit.isPending,
      proceedDisabled: !ready || submit.isPending,
      saved: submit.isSuccess,
      conflict: isVersionConflict(submit.error),
      refusal: null,
      failed: submit.isError && !isVersionConflict(submit.error),
      requestId: null,
      fieldMessages: [],
    });
  }, [
    editable,
    ready,
    submit.isPending,
    submit.isSuccess,
    submit.isError,
    submit.error,
    registerDock,
    onCommit,
  ]);

  useEffect(() => {
    return () => {
      registerDock(null);
    };
  }, [registerDock]);

  const handleToggleNotifications = (value: boolean) => {
    setNotificationsEnabled(value);
    if (value) {
      setPermissionSheetOpen(true);
    }
  };

  if (query.isPending) {
    return (
      <View style={styles.loadingContainer}>
        <Spinner size="sm" />
        <Text style={styles.loadingText}>Loading your application summary…</Text>
      </View>
    );
  }

  if (query.isError && !isMissing) {
    return (
      <ErrorState
        title="We could not load your application"
        message="Nothing you have saved is lost. Check your connection and try again."
        actionLabel="Try again"
        onAction={() => void query.refetch()}
      />
    );
  }

  if (application === null) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.title}>Review & Submit</Text>
        <Text style={styles.subtitle}>You have not started your application yet.</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/apply/about")}
          style={styles.startButton}
        >
          <Text style={styles.startButtonText}>Start Your Application</Text>
        </Pressable>
      </View>
    );
  }

  const displayName = application.display_name || "webaura";
  const bioLength = application.biography?.length ?? 0;
  const agreedCount = application.consents?.length ?? 2;
  const documentsCount = application.documents?.length ?? 2;

  return (
    <View style={styles.container}>
      {/* Title */}
      <View style={styles.header}>
        <Text style={styles.title}>Review & Submit</Text>
      </View>

      {/* 3 Summary Cards matching Screen 5 */}
      <View style={styles.cardsContainer}>
        {/* Card 1: About you */}
        <View style={styles.summaryCard}>
          <View style={styles.cardLeft}>
            <CheckCircle2 size={22} color="#2fa84f" strokeWidth={2.2} />
            <View style={styles.iconWrapper}>
              <User size={18} color="#00112e" strokeWidth={2.2} />
            </View>
            <View style={styles.cardInfo}>
              <Text style={styles.cardTitle}>About you</Text>
              <Text style={styles.cardSubtitle}>
                {displayName} / {bioLength}/200
              </Text>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Edit about you"
            onPress={() => router.push("/apply/about")}
            hitSlop={8}
          >
            <Text style={styles.editText}>Edit</Text>
          </Pressable>
        </View>

        {/* Card 2: Agreements */}
        <View style={styles.summaryCard}>
          <View style={styles.cardLeft}>
            <CheckCircle2 size={22} color="#2fa84f" strokeWidth={2.2} />
            <View style={styles.iconWrapper}>
              <FileText size={18} color="#00112e" strokeWidth={2.2} />
            </View>
            <View style={styles.cardInfo}>
              <Text style={styles.cardTitle}>Agreements</Text>
              <Text style={styles.cardSubtitle}>{agreedCount} agreed</Text>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Edit agreements"
            onPress={() => router.push("/apply/consent")}
            hitSlop={8}
          >
            <Text style={styles.editText}>Edit</Text>
          </Pressable>
        </View>

        {/* Card 3: Documents */}
        <View style={styles.summaryCard}>
          <View style={styles.cardLeft}>
            <CheckCircle2 size={22} color="#2fa84f" strokeWidth={2.2} />
            <View style={styles.iconWrapper}>
              <FileCheck2 size={18} color="#00112e" strokeWidth={2.2} />
            </View>
            <View style={styles.cardInfo}>
              <Text style={styles.cardTitle}>Documents</Text>
              <Text style={styles.cardSubtitle}>{documentsCount} documents</Text>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Edit documents"
            onPress={() => router.push("/apply/documents")}
            hitSlop={8}
          >
            <Text style={styles.editText}>Edit</Text>
          </Pressable>
        </View>
      </View>

      {/* Notification Toggle Card matching Screen 5 */}
      <View style={styles.notificationCard}>
        <View style={styles.notificationLeft}>
          <View style={styles.bellIconBox}>
            <Bell size={20} color="#f26a0f" strokeWidth={2.2} />
          </View>
          <View style={styles.notificationInfo}>
            <Text style={styles.notificationTitle}>Get updates on your application</Text>
            <Text style={styles.notificationSubtitle}>We'll notify you when it's reviewed.</Text>
          </View>
        </View>
        <Switch
          value={notificationsEnabled}
          onValueChange={handleToggleNotifications}
          trackColor={{ false: "#e2e8f0", true: "#f26a0f" }}
          thumbColor={Platform.OS === "android" ? "#ffffff" : undefined}
          ios_backgroundColor="#e2e8f0"
        />
      </View>

      {/* Screen 6: Notification Permission Bottom Sheet */}
      <NotificationPermissionSheet
        visible={permissionSheetOpen}
        onClose={() => setPermissionSheetOpen(false)}
        onGranted={() => setNotificationsEnabled(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "column",
    width: "100%",
  },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: 8,
    paddingVertical: 32,
  },
  loadingText: {
    fontSize: 14,
    color: "#64748b",
  },
  emptyContainer: {
    paddingVertical: 24,
    alignItems: "center",
  },
  header: {
    marginBottom: 20,
    marginTop: 4,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: "#00112e",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: "#64748b",
    marginTop: 4,
  },
  startButton: {
    marginTop: 16,
    backgroundColor: "#f26a0f",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 9999,
  },
  startButtonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 15,
  },
  cardsContainer: {
    flexDirection: "column",
    rowGap: 12,
    marginBottom: 16,
  },
  summaryCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingVertical: 16,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  cardLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    columnGap: 12,
  },
  iconWrapper: {
    width: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  cardInfo: {
    flexDirection: "column",
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#00112e",
    letterSpacing: -0.2,
  },
  cardSubtitle: {
    fontSize: 13,
    color: "#64748b",
    marginTop: 2,
  },
  editText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#2563eb",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  notificationCard: {
    backgroundColor: "#fff7ed",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#fed7aa",
    paddingVertical: 16,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
    marginBottom: 24,
  },
  notificationLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    columnGap: 12,
    paddingRight: 8,
  },
  bellIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#ffedd5",
    alignItems: "center",
    justifyContent: "center",
  },
  notificationInfo: {
    flexDirection: "column",
    flex: 1,
  },
  notificationTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#00112e",
    letterSpacing: -0.2,
  },
  notificationSubtitle: {
    fontSize: 12,
    color: "#78350f",
    marginTop: 2,
  },
});
