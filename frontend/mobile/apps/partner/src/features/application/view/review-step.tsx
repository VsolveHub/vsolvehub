// Ported from frontend/apps/partner/features/application/view/review-step.tsx
import { ApiRequestError } from "@vsolve/api-client";
import { ErrorState, Spinner, Text } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import {
  AlertCircle,
  Bell,
  Bike,
  Briefcase,
  Check,
  CheckCircle2,
  Circle,
  Clock,
  FileCheck2,
  MapPin,
  User,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";

import { NotificationPermissionSheet } from "@/features/onboarding/components/notification-permission-sheet";
import { vehicleTypeName } from "@/features/rides/model/shell";
import { useCaptainStatus } from "@/features/rides/queries";
import { useApplyDock } from "../model/dock-context";
import { isEditable, outstandingRequirements } from "../model/readiness";
import { isListingTrack } from "../model/steps";
import {
  describeRefusal,
  isVersionConflict,
  usePartnerApplication,
  usePartnerAvailability,
  useSubmitApplication,
  useUpdateApplication,
} from "../queries";
import { useApplicationReference } from "../reference-queries";
import { ConsentList } from "./consent-step";

const consentKey = (purpose: string, version: string) => `${purpose}@${version}`;

export function ReviewStep() {
  const router = useRouter();
  const query = usePartnerApplication();
  // A ride captain also sends a vehicle; it is listed below with the rest, to check or add.
  const isCaptain = query.data?.track === "RIDE_CAPTAIN";
  const vehicle = useCaptainStatus(isCaptain).data?.vehicle ?? null;
  const submit = useSubmitApplication();
  const updateApp = useUpdateApplication();
  const { registerDock } = useApplyDock();

  // Optional: nobody has to accept push notifications to send an application.
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [permissionSheetOpen, setPermissionSheetOpen] = useState(false);

  const isMissing = query.error instanceof ApiRequestError && query.error.status === 404;
  const application = query.data ?? null;
  const editable = application !== null && isEditable(application);
  const availability = usePartnerAvailability();
  const reference = useApplicationReference();
  const requiredConsents = useMemo(
    () => (reference.requiredConsents ?? []).filter((consent) => consent.is_required_for_submission),
    [reference.requiredConsents],
  );

  // As on the website: agreements already on record stay ticked; new ticks are kept here and
  // saved together with the send, after the "details are true" box.
  const locked = useMemo(
    () =>
      new Set(
        (application?.consents ?? [])
          .filter((consent) => consent.withdrawn_at === null)
          .map((consent) => consentKey(consent.purpose, consent.document_version)),
      ),
    [application?.consents],
  );
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const [declared, setDeclared] = useState(false);
  const isAccepted = (purpose: string, version: string) => {
    const key = consentKey(purpose, version);
    return locked.has(key) || ticked.has(key);
  };
  const toggleConsent = (purpose: string, version: string) => {
    const key = consentKey(purpose, version);
    if (locked.has(key)) return;
    setTicked((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const consentsTicked = requiredConsents.every((consent) =>
    isAccepted(consent.purpose, consent.document_version),
  );
  const outstanding =
    application === null
      ? []
      : outstandingRequirements(application, availability.data).filter(
          (requirement) => requirement.code !== "CONSENTS",
        );
  const ready =
    application !== null && editable && outstanding.length === 0 && consentsTicked && declared;
  const appStatus = (application?.status as string) || "";
  const isSubmitted =
    appStatus === "SUBMITTED" ||
    appStatus === "UNDER_REVIEW" ||
    appStatus === "APPROVED" ||
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

  const isSaving = submit.isPending || updateApp.isPending;

  const addedConsents = useMemo(
    () =>
      requiredConsents.filter((consent) => {
        const key = consentKey(consent.purpose, consent.document_version);
        return ticked.has(key) && !locked.has(key);
      }),
    [requiredConsents, ticked, locked],
  );
  const saveConsents = updateApp.mutateAsync;

  const onCommit = useCallback(async () => {
    if (isSaving) return;
    try {
      if (addedConsents.length > 0) {
        await saveConsents({
          consents: addedConsents.map((consent) => ({
            purpose: consent.purpose,
            document_version: consent.document_version,
          })),
        });
      }
      submitMutateRef.current(undefined, {
        onSuccess: () => {
          void refetchRef.current();
          router.replace("/apply/status" as any);
        },
      });
    } catch {
      // Shown from the mutation state below.
    }
  }, [isSaving, router, addedConsents, saveConsents]);

  const canProceed = ready && !isSaving;

  const activeError = submit.error || updateApp.error;
  const conflict = isVersionConflict(activeError);
  const refusal = describeRefusal(activeError);

  useEffect(() => {
    if (!editable) {
      registerDock(null);
      return;
    }

    registerDock({
      label: application?.status === "CHANGES_REQUIRED" ? "Send again" : "Send application",
      backHref: "/apply/documents",
      nextStepName: null,
      onCommit,
      isSaving,
      proceedDisabled: !canProceed,
      saved: submit.isSuccess,
      conflict,
      refusal,
      failed: Boolean(activeError && !conflict && !refusal),
      requestId: null,
      fieldMessages: [],
    });
  }, [
    editable,
    canProceed,
    isSaving,
    submit.isSuccess,
    activeError,
    conflict,
    refusal,
    registerDock,
    onCommit,
    application?.status,
  ]);

  useEffect(() => {
    return () => {
      registerDock(null);
    };
  }, [registerDock]);

  const handleToggleNotifications = () => {
    const nextValue = !notificationsEnabled;
    setNotificationsEnabled(nextValue);
    if (nextValue) {
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
        <Text style={styles.title}>Agree & send</Text>
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

  const displayName = application.display_name;
  const bioLength = application.biography?.length ?? 0;
  const listing = isListingTrack(application.track);
  const areaNames = application.service_area_ids.map(
    (id) => reference.serviceAreas.find((area) => area.id === id)?.name ?? id.slice(0, 8),
  );
  const hoursSet = application.service_area_ids.filter((areaId) =>
    (availability.data?.rules ?? []).some((rule) => rule.service_area_id === areaId && rule.is_active),
  ).length;
  const documentsCount = application.documents.filter((document) => document.status !== "SUPERSEDED").length;

  return (
    <View style={styles.container}>
      {/* Title */}
      <View style={styles.header}>
        <Text style={styles.title}>Agree & send</Text>
        <Text style={styles.subtitle}>Check your details, accept the agreements and send.</Text>
      </View>

      {/* Error / Refusal Banner if submission failed */}
      {activeError && (
        <View style={styles.errorBanner}>
          <AlertCircle size={20} color="#b91c1c" />
          <View style={styles.errorBannerText}>
            <Text style={styles.errorBannerTitle}>
              {refusal?.title || (conflict ? "Version conflict" : "Could not submit application")}
            </Text>
            <Text style={styles.errorBannerMessage}>
              {refusal?.message ||
                (conflict
                  ? "Someone else updated this application. Please try again."
                  : activeError instanceof ApiRequestError
                    ? activeError.message
                    : "We could not submit your application. Check your connection and try again.")}
            </Text>
          </View>
        </View>
      )}

      {/* 3 Summary Cards matching Screen 5 & User Mockup */}
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

        {listing ? null : (
          <>
            <SummaryCard
              icon={<Briefcase size={18} color="#00112e" strokeWidth={2.2} />}
              title="Your work"
              subtitle={`${application.skill_codes.length} trades · ${application.service_variant_ids.length} job types`}
              done={application.service_variant_ids.length > 0}
              onEdit={() => router.push("/apply/work")}
            />
            <SummaryCard
              icon={<MapPin size={18} color="#00112e" strokeWidth={2.2} />}
              title="Where you work"
              subtitle={areaNames.length > 0 ? areaNames.join(", ") : "Not set yet"}
              done={application.service_area_ids.length > 0}
              onEdit={() => router.push("/apply/areas" as never)}
            />
            <SummaryCard
              icon={<Clock size={18} color="#00112e" strokeWidth={2.2} />}
              title="Your hours"
              subtitle={`Set for ${hoursSet} of ${application.service_area_ids.length} areas`}
              done={application.service_area_ids.length > 0 && hoursSet === application.service_area_ids.length}
              onEdit={() => router.push("/apply/schedule")}
            />
          </>
        )}

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

        {isCaptain ? (
          <SummaryCard
            icon={<Bike size={18} color="#00112e" strokeWidth={2.2} />}
            title="Your vehicle"
            subtitle={
              vehicle
                ? `${vehicleTypeName(vehicle.vehicle_type)} · ${vehicle.registration_number}`
                : "Not added yet"
            }
            done={vehicle !== null}
            onEdit={() => router.push("/rides/vehicle")}
          />
        ) : null}
      </View>

      {editable ? (
        <View style={styles.agreements}>
          <Text style={styles.agreementsTitle}>Agreements</Text>
          <ConsentList
            documents={requiredConsents}
            isAccepted={isAccepted}
            onToggle={toggleConsent}
            disabled={isSaving}
          />
          <Pressable
            cssInterop={false}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: declared, disabled: isSaving }}
            disabled={isSaving}
            onPress={() => setDeclared(!declared)}
            style={styles.declaration}
          >
            <View style={[styles.declarationBox, declared ? styles.declarationBoxOn : null]}>
              {declared ? <Check size={14} color="#ffffff" strokeWidth={3} /> : null}
            </View>
            <Text style={styles.declarationText}>{"The details and documents I've given are true."}</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Notification Toggle Card matching User Uploaded Image 2 */}
      <View style={styles.notificationCard}>
        <View style={styles.notificationLeft}>
          <View style={styles.bellIconBox}>
            <Bell size={20} color="#f87000" strokeWidth={2.2} />
          </View>
          <View style={styles.notificationInfo}>
            <Text style={styles.notificationTitle}>Get updates on your application</Text>
            <Text style={styles.notificationSubtitle}>We'll notify you when it's reviewed.</Text>
          </View>
        </View>

        {/* Custom Toggle Switch matching exact image: Orange track with Teal/Emerald knob when active */}
        <Pressable
          accessibilityRole="switch"
          accessibilityLabel="Get updates on your application"
          accessibilityState={{ checked: notificationsEnabled }}
          onPress={handleToggleNotifications}
          style={[
            styles.customSwitchTrack,
            {
              backgroundColor: notificationsEnabled ? "#ea580c" : "#cbd5e1",
            },
          ]}
        >
          <View
            style={[
              styles.customSwitchThumb,
              {
                backgroundColor: notificationsEnabled ? "#008a7a" : "#ffffff",
                alignSelf: notificationsEnabled ? "flex-end" : "flex-start",
              },
            ]}
          />
        </Pressable>
      </View>

      {/* Notification Permission Bottom Sheet */}
      <NotificationPermissionSheet
        visible={permissionSheetOpen}
        onClose={() => setPermissionSheetOpen(false)}
        onGranted={() => setNotificationsEnabled(true)}
      />
    </View>
  );
}

function SummaryCard({
  icon,
  title,
  subtitle,
  done,
  onEdit,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  done: boolean;
  onEdit: () => void;
}) {
  return (
    <View style={styles.summaryCard}>
      <View style={styles.cardLeft}>
        {done ? (
          <CheckCircle2 size={22} color="#2fa84f" strokeWidth={2.2} />
        ) : (
          <Circle size={22} color="#cbd5e1" strokeWidth={2.2} />
        )}
        <View style={styles.iconWrapper}>{icon}</View>
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardSubtitle}>{subtitle}</Text>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Edit ${title.toLowerCase()}`}
        onPress={onEdit}
        hitSlop={8}
      >
        <Text style={styles.editText}>Edit</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  agreements: {
    rowGap: 12,
    marginBottom: 16,
  },
  agreementsTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#00112e",
  },
  declaration: {
    flexDirection: "row",
    alignItems: "flex-start",
    columnGap: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#ffffff",
  },
  declarationBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#cbd5e1",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  declarationBoxOn: {
    backgroundColor: "#ea580c",
    borderColor: "#ea580c",
  },
  declarationText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: "#00112e",
  },
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
    backgroundColor: "#f87000",
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
    borderRadius: 20,
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
    color: "#1d4ed8",
    textDecorationLine: "underline",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  notificationCard: {
    backgroundColor: "#fff7ed",
    borderRadius: 20,
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
    fontSize: 15,
    fontWeight: "700",
    color: "#071328",
    letterSpacing: -0.2,
  },
  notificationSubtitle: {
    fontSize: 13.5,
    color: "#78350f",
    marginTop: 2,
  },
  customSwitchTrack: {
    width: 54,
    height: 30,
    borderRadius: 15,
    paddingHorizontal: 3,
    justifyContent: "center",
  },
  customSwitchThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    ...(Platform.OS === "web"
      ? ({
          boxShadow: "0 2px 4px rgba(0, 0, 0, 0.2)",
          transition: "all 0.2s ease-in-out",
        } as any)
      : {
          elevation: 3,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1.5 },
          shadowOpacity: 0.2,
          shadowRadius: 2.5,
        }),
  },
  errorBanner: {
    flexDirection: "row",
    backgroundColor: "#fef2f2",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#fecaca",
    padding: 12,
    marginBottom: 16,
    alignItems: "flex-start",
    columnGap: 10,
  },
  errorBannerText: {
    flex: 1,
  },
  errorBannerTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#b91c1c",
  },
  errorBannerMessage: {
    fontSize: 13,
    color: "#991b1b",
    marginTop: 2,
    lineHeight: 18,
  },
});