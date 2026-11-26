import { ApiRequestError } from "@vsolve/api-client";
import { Text, useT } from "@vsolve/mobile-ui";
import { useMobileLogout } from "@vsolve/mobile-core";
import { useRouter } from "expo-router";
import { Check, Trash2 } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BrandHeader } from "@/features/onboarding/components/brand-header";
import { setFocusedBackHandler } from "@/features/session/focused-back";
import { useCreatePrivacyRequest } from "./privacy-queries";

export type DeleteStep = "STEP_1_WARN" | "STEP_2_CONFIRM" | "STEP_3_DONE";

/** "18 Dec 2026", in India's time zone: the day the account is erased. */
function deletionDate(value: string): string {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(
    new Date(value),
  );
}

/**
 * Delete account, in three steps: what happens, type DELETE, and the date it goes.
 *
 * Every sentence is a rule in `backend/apps/identity/account_deletion.py` and on the public page
 * (`partner.vsolvehub.com/delete-account`): the account closes at once, it is erased 30 days
 * later unless the person signs in again, open jobs refuse the request, money owed is paid first,
 * and payout and tax records are kept. Filing it is a request with a date, so the last step says
 * "closed" and gives the date, never "deleted" — nothing has been erased yet.
 *
 * `showHeader` is false under `/me`, where the tabs shell already draws the back bar; the
 * `/delete-account` route outside `(app)` has no shell, so it keeps this screen's own header.
 * Every back (that bar, this header, Android's back button) steps back through the steps first.
 */

export function DeleteAccountScreen({ showHeader = true }: { showHeader?: boolean } = {}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 1024;
  const bottomInset = Math.max(insets.bottom, Platform.OS === "ios" ? 34 : 16);

  const signOut = useMobileLogout("/login");
  const createRequest = useCreatePrivacyRequest();

  const [step, setStep] = useState<DeleteStep>("STEP_1_WARN");
  const [confirmInput, setConfirmInput] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletesOn, setDeletesOn] = useState<string | null>(null);

  const isConfirmed = confirmInput.trim() === "DELETE";
  const t = useT();

  const handleDone = useCallback(async () => {
    await signOut();
    router.replace("/login" as any);
  }, [signOut, router]);

  /**
   * True when back was handled inside the flow; false means "leave this screen". The account is
   * already closed on the last step, so back there finishes like Done rather than returning to
   * the app, and nothing moves while the request is in flight.
   */
  const stepBack = useCallback((): boolean => {
    if (isDeleting) return true;
    if (step === "STEP_2_CONFIRM") {
      setStep("STEP_1_WARN");
      return true;
    }
    if (step === "STEP_3_DONE") {
      void handleDone();
      return true;
    }
    return false;
  }, [isDeleting, step, handleDone]);

  const handleBack = () => {
    if (!stepBack()) router.back();
  };

  useEffect(() => {
    if (showHeader) return undefined;
    setFocusedBackHandler(stepBack);
    return () => setFocusedBackHandler(null);
  }, [showHeader, stepBack]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", stepBack);
    return () => subscription.remove();
  }, [stepBack]);

  const handleDeleteSubmit = () => {
    if (!isConfirmed || isDeleting) return;
    setIsDeleting(true);

    createRequest.mutate("ERASURE", {
      onSuccess: (created) => {
        setIsDeleting(false);
        setDeletesOn(created.scheduled_for ?? null);
        setStep("STEP_3_DONE");
      },
      // Never say "requested" when it was not: stay here and let them try again.
      onError: () => setIsDeleting(false),
    });
  };

  return (
    <View style={styles.root}>
      {showHeader ? (
        <BrandHeader
          showBack={step !== "STEP_3_DONE"}
          onBack={handleBack}
          showAvatar={false}
        />
      ) : null}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          {
            maxWidth: isDesktop ? 540 : "100%",
            paddingBottom: bottomInset + 120,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Screen 15: Delete account - Step 1 */}
        {step === "STEP_1_WARN" ? (
          <View style={styles.stepContainer}>
            {/* Red Trash Icon */}
            <View style={styles.trashCircle}>
              <Trash2 size={36} color="#dc2626" strokeWidth={2.2} />
            </View>

            {/* Title & Description */}
            <Text style={styles.title}>{t("apply.account.delete.title")}</Text>
            <Text style={styles.subtitle}>
              {t("apply.account.delete.subtitle")}
            </Text>

            {/* 3 Red Bullet Points matching Screen 15 */}
            <View style={styles.bulletList}>
              <View style={styles.bulletItem}>
                <View style={styles.bulletDot} />
                <Text style={styles.bulletText}>
                  {t("apply.account.delete.bullet.signOut")}
                </Text>
              </View>

              <View style={styles.bulletItem}>
                <View style={styles.bulletDot} />
                <Text style={styles.bulletText}>
                  {t("apply.account.delete.bullet.data")}
                </Text>
              </View>

              <View style={styles.bulletItem}>
                <View style={styles.bulletDot} />
                <Text style={styles.bulletText}>
                  {t("apply.account.delete.bullet.openWork")}
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        {/* Screen 16: Delete account - Step 2 (Type DELETE) */}
        {createRequest.isError ? (
          <Text accessibilityRole="alert" style={{ color: "#b91c1c", fontWeight: "600", marginBottom: 12 }}>
            {createRequest.error instanceof ApiRequestError &&
            createRequest.error.code === "account_deletion_open_work"
              ? t("apply.account.delete.error.openWork")
              : t("apply.account.delete.error.generic")}
          </Text>
        ) : null}
        {step === "STEP_2_CONFIRM" ? (
          <View style={styles.stepContainer}>
            {/* Smaller Red Trash Icon */}
            <View style={[styles.trashCircle, { width: 64, height: 64, borderRadius: 32 }]}>
              <Trash2 size={30} color="#dc2626" strokeWidth={2.2} />
            </View>

            {/* Title & Description */}
            <Text style={styles.title}>{t("apply.account.delete.typeTitle")}</Text>
            <Text style={styles.subtitle}>
              {t("apply.account.delete.typeBody")}
            </Text>

            {/* Type DELETE Input Box */}
            <View style={styles.inputWrapper}>
              <TextInput
                value={confirmInput}
                onChangeText={setConfirmInput}
                placeholder="DELETE"
                placeholderTextColor="#94a3b8"
                autoCapitalize="characters"
                style={styles.deleteInput}
              />
            </View>
          </View>
        ) : null}

        {/* Screen 17: Account deleted */}
        {step === "STEP_3_DONE" ? (
          <View style={styles.stepContainer}>
            {/* Green Celebration Circle with Rays */}
            <View style={styles.celebrationWrapper}>
              {/* Decorative radial dots */}
              <View style={[styles.burstDot, { top: 0, left: "50%", marginLeft: -3 }]} />
              <View style={[styles.burstDot, { bottom: 0, left: "50%", marginLeft: -3 }]} />
              <View style={[styles.burstDot, { left: 0, top: "50%", marginTop: -3 }]} />
              <View style={[styles.burstDot, { right: 0, top: "50%", marginTop: -3 }]} />
              <View style={[styles.burstDot, { top: 12, left: 12 }]} />
              <View style={[styles.burstDot, { top: 12, right: 12 }]} />
              <View style={[styles.burstDot, { bottom: 12, left: 12 }]} />
              <View style={[styles.burstDot, { bottom: 12, right: 12 }]} />

              <View style={styles.greenCheckCircle}>
                <Check size={40} color="#16a34a" strokeWidth={3.2} />
              </View>
            </View>

            <Text style={styles.title}>{t("apply.account.delete.closed.title")}</Text>
            <Text style={styles.subtitle}>
              {deletesOn
                ? t("apply.account.delete.closed.body", { date: deletionDate(deletesOn) })
                : t("apply.account.delete.closed.bodyNoDate")}
            </Text>
          </View>
        ) : null}
      </ScrollView>

      {/* Bottom Sticky Action Buttons */}
      <View style={[styles.dockContainer, { paddingBottom: bottomInset + 16 }]}>
        <View style={[styles.dockInner, { maxWidth: isDesktop ? 540 : "100%" }]}>
          {step === "STEP_1_WARN" ? (
            <View style={styles.buttonStack}>
              <Pressable cssInterop={false}
                accessibilityRole="button"
                accessibilityLabel="Delete my account"
                onPress={() => setStep("STEP_2_CONFIRM")}
                style={({ pressed }) => [
                  styles.solidRedButton,
                  pressed ? { opacity: 0.9 } : null,
                ]}
              >
                <Text style={styles.solidRedButtonText}>{t("apply.account.delete.confirm")}</Text>
              </Pressable>

              <Pressable cssInterop={false}
                accessibilityRole="button"
                accessibilityLabel="Keep my account"
                onPress={() => router.back()}
                style={({ pressed }) => [
                  styles.outlineButton,
                  pressed ? { backgroundColor: "#f8fafc" } : null,
                ]}
              >
                <Text style={styles.outlineButtonText}>{t("apply.account.delete.keep")}</Text>
              </Pressable>
            </View>
          ) : null}

          {step === "STEP_2_CONFIRM" ? (
            <Pressable cssInterop={false}
              accessibilityRole="button"
              accessibilityLabel="Delete my account"
              disabled={!isConfirmed || isDeleting}
              onPress={handleDeleteSubmit}
              style={({ pressed }) => [
                styles.solidRedButton,
                !isConfirmed ? styles.solidRedButtonDisabled : null,
                pressed && isConfirmed ? { opacity: 0.9 } : null,
              ]}
            >
              {isDeleting ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text style={styles.solidRedButtonText}>{t("apply.account.delete.confirm")}</Text>
              )}
            </Pressable>
          ) : null}

          {step === "STEP_3_DONE" ? (
            <Pressable cssInterop={false}
              accessibilityRole="button"
              accessibilityLabel="Done"
              onPress={handleDone}
              style={({ pressed }) => [
                styles.solidOrangeButton,
                pressed ? { opacity: 0.9 } : null,
              ]}
            >
              <Text style={styles.solidOrangeButtonText}>{t("common.done")}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 36,
    width: "100%",
    alignSelf: "center",
  },
  stepContainer: {
    alignItems: "center",
    flexDirection: "column",
  },
  trashCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  celebrationWrapper: {
    width: 130,
    height: 130,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    position: "relative",
  },
  burstDot: {
    position: "absolute",
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#86efac",
  },
  greenCheckCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#dcfce7",
    borderWidth: 1,
    borderColor: "#bbf7d0",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: "#00112e",
    letterSpacing: -0.4,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14.5,
    color: "#64748b",
    lineHeight: 22,
    textAlign: "center",
    marginTop: 8,
    paddingHorizontal: 8,
  },
  bulletList: {
    marginTop: 28,
    alignSelf: "stretch",
    flexDirection: "column",
    rowGap: 14,
    paddingHorizontal: 6,
  },
  bulletItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#dc2626",
    marginRight: 12,
  },
  bulletText: {
    fontSize: 14.5,
    color: "#334155",
    fontWeight: "500",
    flex: 1,
    lineHeight: 20,
  },
  inputWrapper: {
    marginTop: 28,
    alignSelf: "stretch",
  },
  deleteInput: {
    backgroundColor: "#ffffff",
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    fontWeight: "700",
    color: "#00112e",
    textAlign: "left",
  },
  dockContainer: {
    position: Platform.OS === "web" ? ("fixed" as any) : "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#ffffff",
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  dockInner: {
    width: "100%",
    alignSelf: "center",
  },
  buttonStack: {
    flexDirection: "column",
    rowGap: 12,
  },
  solidRedButton: {
    backgroundColor: "#dc2626",
    borderRadius: 14,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  solidRedButtonDisabled: {
    backgroundColor: "#fca5a5",
    opacity: 0.7,
  },
  solidRedButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
  outlineButton: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    height: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  outlineButtonText: {
    color: "#00112e",
    fontSize: 16,
    fontWeight: "700",
  },
  solidOrangeButton: {
    backgroundColor: "#f26a0f",
    borderRadius: 14,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  solidOrangeButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
});
