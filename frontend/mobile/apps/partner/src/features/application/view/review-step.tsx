// Ported from frontend/apps/partner/features/application/view/review-step.tsx
import { ApiRequestError, type Schemas } from "@vsolve/api-client";
import { ErrorState, Spinner, Text, useT } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { AlertCircle, Bell, Check, X } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState, useLayoutEffect } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import { NotificationPermissionSheet } from "@/features/onboarding/components/notification-permission-sheet";
import { useApplyDock } from "../model/dock-context";
import { hiringAsOf } from "../model/employer";
import { SIZES } from "../model/employer-form";
import {
  isEditable,
  outstandingRequirements,
  requiredDocumentKinds,
} from "../model/readiness";
import { documentLabel, documentStatusPresentation, statusRouteFor } from "../model/status";
import { isListingTrack } from "../model/steps";
import {
  describeRefusal,
  isVersionConflict,
  usePartnerApplication,
  usePartnerAvailability,
  useSubmitApplication,
  useUpdateApplication,
} from "../queries";
import { useApplicationReference, type RequiredConsent } from "../reference-queries";
import { StepFrame } from "./application-editor";

type Application = Schemas["PartnerApplication"];
type DocumentKind = Schemas["PartnerDocumentKindEnum"];

function currentDocument(
  application: Application,
  kind: DocumentKind,
): Schemas["PartnerDocument"] | null {
  const matches = application.documents.filter(
    (doc) => doc.kind === kind && doc.status !== "SUPERSEDED",
  );
  if (matches.length === 0) return null;
  return matches[matches.length - 1] ?? null;
}

const consentKey = (purpose: string, version: string) => `${purpose}@${version}`;

export function ReviewStep() {
  const t = useT();
  const router = useRouter();
  const query = usePartnerApplication();
  const submit = useSubmitApplication();
  const updateApp = useUpdateApplication();
  const { registerDock } = useApplyDock();

  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [permissionSheetOpen, setPermissionSheetOpen] = useState(false);
  const [selectedConsentDoc, setSelectedConsentDoc] = useState<RequiredConsent | null>(null);

  const isMissing = query.error instanceof ApiRequestError && query.error.status === 404;
  const application = query.data ?? null;
  const editable = application !== null && isEditable(application);
  const availability = usePartnerAvailability();
  const reference = useApplicationReference();
  const requiredConsents = useMemo(
    () => (reference.requiredConsents ?? []).filter((consent) => consent.is_required_for_submission),
    [reference.requiredConsents],
  );

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

  useEffect(() => {
    if (isSubmitted) {
      router.replace(statusRouteFor(appStatus) as any);
    }
  }, [appStatus, isSubmitted, router]);

  const submitMutateRef = useRef(submit.mutate);
  const refetchRef = useRef(query.refetch);
  useLayoutEffect(() => {
    submitMutateRef.current = submit.mutate;
    refetchRef.current = query.refetch;
  });

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
          // A sent application has just become SUBMITTED; the screen for that is `/apply`.
          router.replace(statusRouteFor("SUBMITTED") as any);
        },
      });
    } catch {
      // Shown from the mutation state below.
    }
  }, [isSaving, router, addedConsents, saveConsents]);

  const canProceed = ready && !isSaving;

  const activeError = submit.error || updateApp.error;
  const conflict = isVersionConflict(activeError);
  const refusal = describeRefusal(activeError, t);

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
      <StepFrame title="Agree & send">
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>You have not started your application yet.</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/apply/about")}
            style={styles.startButton}
          >
            <Text style={styles.startButtonText}>Start your application</Text>
          </Pressable>
        </View>
      </StepFrame>
    );
  }

  const displayName = application.display_name;
  const listing = isListingTrack(application.track);
  const areaNames = application.service_area_ids.map(
    (id) => reference.serviceAreas.find((area) => area.id === id)?.name ?? id.slice(0, 8),
  );
  const hoursSet = application.service_area_ids.filter((areaId) =>
    (availability.data?.rules ?? []).some((rule) => rule.service_area_id === areaId && rule.is_active),
  ).length;

  return (
    <View style={styles.container}>
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

      {/* Main Step Frame matching reference images */}
      <StepFrame
        title="Agree & send"
        description={editable ? "Check your details, accept the agreements and send." : undefined}
      >
        {/* Definition List of Application Steps */}
        <View style={styles.summaryList}>
          {/* Row 1: About you, or for an employer who is hiring and what they gave for that type */}
          {application.track === "EMPLOYER" ? (
            <EmployerRows application={application} />
          ) : (
            <>
              <View style={styles.summaryRow}>
                <View style={styles.summaryLeftCol}>
                  <Text style={styles.summaryLabel}>About you</Text>
                  <Text style={styles.summaryValue}>{displayName || "Not set"}</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Edit about you"
                  onPress={() => router.push("/apply/about")}
                  hitSlop={8}
                >
                  <Text style={styles.editLink}>Edit</Text>
                </Pressable>
              </View>

              <View style={styles.summaryDivider} />
            </>
          )}

          {/* Services-only Steps */}
          {listing ? null : (
            <>
              <View style={styles.summaryRow}>
                <View style={styles.summaryLeftCol}>
                  <Text style={styles.summaryLabel}>Your work</Text>
                  <Text style={styles.summaryValue}>
                    {`${application.skill_codes.length} trades · ${application.service_variant_ids.length} job types`}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Edit your work"
                  onPress={() => router.push("/apply/work")}
                  hitSlop={8}
                >
                  <Text style={styles.editLink}>Edit</Text>
                </Pressable>
              </View>

              <View style={styles.summaryDivider} />

              <View style={styles.summaryRow}>
                <View style={styles.summaryLeftCol}>
                  <Text style={styles.summaryLabel}>Where you work</Text>
                  {areaNames.length > 0 ? (
                    <Text style={styles.summaryValue}>{areaNames.join(", ")}</Text>
                  ) : null}
                  {(application.requested_postal_codes?.length ?? 0) > 0 ? (
                    <Text style={[styles.summaryValue, { fontSize: 12, opacity: 0.7 }]}>
                      {t("apply.review.summary.requestedPins", {
                        pins: (application.requested_postal_codes ?? []).join(", "),
                      })}
                    </Text>
                  ) : areaNames.length === 0 ? (
                    <Text style={styles.summaryValue}>{t("apply.review.notSet")}</Text>
                  ) : null}
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Edit where you work"
                  onPress={() => router.push("/apply/areas" as never)}
                  hitSlop={8}
                >
                  <Text style={styles.editLink}>Edit</Text>
                </Pressable>
              </View>

              <View style={styles.summaryDivider} />

              <View style={styles.summaryRow}>
                <View style={styles.summaryLeftCol}>
                  <Text style={styles.summaryLabel}>Your hours</Text>
                  <Text style={styles.summaryValue}>
                    {application.service_area_ids.length === 0 &&
                    (application.requested_postal_codes?.length ?? 0) > 0
                      ? t("apply.review.summary.hoursNotNeededYet")
                      : t("apply.review.summary.hours", {
                          set: hoursSet,
                          total: application.service_area_ids.length,
                        })}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Edit your hours"
                  onPress={() => router.push("/apply/schedule")}
                  hitSlop={8}
                >
                  <Text style={styles.editLink}>Edit</Text>
                </Pressable>
              </View>

              <View style={styles.summaryDivider} />
            </>
          )}

          {/* Row 2: Documents */}
          <View style={styles.summaryRow}>
            <View style={styles.summaryLeftCol}>
              <Text style={styles.summaryLabel}>Documents</Text>
              <View style={styles.badgeRow}>
                {requiredDocumentKinds(application).map((kind) => {
                  const doc = currentDocument(application, kind);
                  const badge = doc ? documentStatusPresentation(doc) : null;
                  return (
                    <View key={kind} style={styles.badgePill}>
                      <Text style={styles.badgeText}>
                        {documentLabel(kind)}: {badge ? badge.label : "Not uploaded"}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Edit documents"
              onPress={() => router.push("/apply/documents")}
              hitSlop={8}
            >
              <Text style={styles.editLink}>Edit</Text>
            </Pressable>
          </View>
        </View>

        {/* Blocker Card: "Still needed before you can send:" */}
        {editable && outstanding.length > 0 ? (
          <View style={styles.outstandingCard}>
            <Text style={styles.outstandingTitle}>Still needed before you can send:</Text>
            <View style={styles.outstandingList}>
              {outstanding.map((req) => (
                <Pressable
                  key={req.code}
                  accessibilityRole="link"
                  accessibilityLabel={req.label}
                  onPress={() => router.push(req.href as any)}
                  hitSlop={6}
                >
                  <Text style={styles.outstandingLink}>{req.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {/* Agreements Section */}
        {editable ? (
          <View style={styles.agreementsSection}>
            <Text style={styles.agreementsHeading}>Agreements</Text>

            {requiredConsents.map((doc) => {
              const key = consentKey(doc.purpose, doc.document_version);
              const accepted = isAccepted(doc.purpose, doc.document_version);
              const isLocked = locked.has(key);
              return (
                <View key={key} style={styles.agreementCard}>
                  <Pressable
                    cssInterop={false}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: accepted, disabled: isSaving || isLocked }}
                    disabled={isSaving || isLocked}
                    onPress={() => toggleConsent(doc.purpose, doc.document_version)}
                    style={[
                      styles.checkbox,
                      accepted ? styles.checkboxChecked : styles.checkboxUnchecked,
                    ]}
                  >
                    {accepted ? <Check size={13} color="#ffffff" strokeWidth={3} /> : null}
                  </Pressable>

                  <View style={styles.agreementContent}>
                    <Pressable
                      disabled={isSaving || isLocked}
                      onPress={() => toggleConsent(doc.purpose, doc.document_version)}
                    >
                      <Text style={styles.agreementText}>
                        I agree to the {doc.title}
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Read ${doc.title}`}
                      onPress={() => setSelectedConsentDoc(doc)}
                      hitSlop={6}
                    >
                      <Text style={styles.readDocumentLink}>Read document</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}

            {/* Declaration Checkbox Card */}
            <View style={styles.agreementCard}>
              <Pressable
                cssInterop={false}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: declared, disabled: isSaving }}
                disabled={isSaving}
                onPress={() => setDeclared(!declared)}
                style={[
                  styles.checkbox,
                  declared ? styles.checkboxChecked : styles.checkboxUnchecked,
                ]}
              >
                {declared ? <Check size={13} color="#ffffff" strokeWidth={3} /> : null}
              </Pressable>

              <View style={styles.agreementContent}>
                <Pressable
                  disabled={isSaving}
                  onPress={() => setDeclared(!declared)}
                >
                  <Text style={styles.agreementText}>
                    The details and documents I&apos;ve given are true.
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}

        {/* Push Notification Opt-in Card */}
        <View style={styles.notificationCard}>
          <View style={styles.notificationTopRow}>
            <View style={styles.notificationIconCircle}>
              <Bell size={20} color="#f87000" strokeWidth={2} />
            </View>
            <View style={styles.notificationTextContainer}>
              <Text style={styles.notificationTitle}>Get notified about your application</Text>
              <Text style={styles.notificationSubtitle}>
                We&apos;ll tell you when it&apos;s reviewed, approved or needs a change.
              </Text>
            </View>
          </View>
          <View style={styles.notificationBadgeContainer}>
            <Pressable
              cssInterop={false}
              accessibilityRole="button"
              accessibilityLabel="Notification status On"
              onPress={handleToggleNotifications}
              style={styles.onBadgePill}
            >
              <Text style={styles.onBadgeText}>On</Text>
            </Pressable>
          </View>
        </View>
      </StepFrame>

      {/* Document Reader Modal */}
      <Modal
        visible={selectedConsentDoc !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedConsentDoc(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={styles.modalTitle}>{selectedConsentDoc?.title}</Text>
                <Text style={styles.modalVersion}>Version {selectedConsentDoc?.document_version}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close document"
                onPress={() => setSelectedConsentDoc(null)}
                style={styles.modalCloseButton}
              >
                <X size={20} color="#00112e" />
              </Pressable>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={true}>
              <Text style={styles.docBodyText}>
                By accepting this agreement, you acknowledge that you have read and agreed to comply with VSolve Hub&apos;s partner terms, service quality standards, and platform policies.
                {"\n\n"}
                Document URL: {selectedConsentDoc?.document_url || "https://vsolvehub.com/terms"}
              </Text>
            </ScrollView>

            <View style={styles.modalFooter}>
              {selectedConsentDoc && !isAccepted(selectedConsentDoc.purpose, selectedConsentDoc.document_version) ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    toggleConsent(selectedConsentDoc.purpose, selectedConsentDoc.document_version);
                    setSelectedConsentDoc(null);
                  }}
                  style={styles.modalAcceptButton}
                >
                  <Text style={styles.modalAcceptButtonText}>Accept Agreement</Text>
                </Pressable>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setSelectedConsentDoc(null)}
                  style={styles.modalDismissButton}
                >
                  <Text style={styles.modalDismissButtonText}>Close</Text>
                </Pressable>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* Notification Permission Bottom Sheet */}
      <NotificationPermissionSheet
        visible={permissionSheetOpen}
        onClose={() => setPermissionSheetOpen(false)}
        onGranted={() => setNotificationsEnabled(true)}
      />
    </View>
  );
}

/**
 * An employer's summary: who is hiring, then what they gave for that type, each with a way back
 * to its screen. Read from what the server holds, so it never disagrees with the checklist.
 */
function EmployerRows({ application }: { application: Schemas["PartnerApplication"] }) {
  const t = useT();
  const router = useRouter();
  const employer = application.employer;
  const hiringAs = hiringAsOf(employer);
  const notSet = "Not set";
  const place = (area?: string, city?: string) => [area, city].filter(Boolean).join(", ") || notSet;
  const business = employer?.business;
  const size = SIZES.find((option) => option.value === business?.company_size)?.label;
  const lines = [
    business?.business_category ? t(`apply.employer.category.${business.business_category}`) : "",
    size ?? "",
  ].filter(Boolean);
  const gst = business?.gst_registered
    ? t("apply.employer.review.gstin", { gstin: business.gstin })
    : business?.business_proof_type
      ? t("apply.employer.review.noGst")
      : "";

  const row = (label: string, href: string, value: string[]) => (
    <>
      <View style={styles.summaryRow}>
        <View style={styles.summaryLeftCol}>
          <Text style={styles.summaryLabel}>{label}</Text>
          {value.map((line) => (
            <Text key={line} style={styles.summaryValue}>
              {line}
            </Text>
          ))}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Edit ${label.toLowerCase()}`}
          onPress={() => router.push(href as never)}
          hitSlop={8}
        >
          <Text style={styles.editLink}>Edit</Text>
        </Pressable>
      </View>
      <View style={styles.summaryDivider} />
    </>
  );

  return (
    <>
      {row(t("apply.steps.hiringAs"), "/apply/hiring-as", [
        hiringAs
          ? t(
              hiringAs === "INDIVIDUAL"
                ? "apply.employer.hiringAs.individual.title"
                : "apply.employer.hiringAs.business.title",
            )
          : notSet,
      ])}

      {hiringAs === "INDIVIDUAL"
        ? row(t("apply.steps.employerAbout"), "/apply/employer/about", [
            [application.display_name || notSet, place(employer?.area, employer?.city)].join(" · "),
          ])
        : null}

      {hiringAs === "BUSINESS" ? (
        <>
          {row(
            t("apply.steps.employerBusiness"),
            "/apply/employer/business",
            [
              business?.trade_name || business?.legal_name || notSet,
              lines.join(" · "),
              place(business?.area, business?.city),
              gst,
            ].filter(Boolean),
          )}
          {row(t("apply.steps.employerContact"), "/apply/employer/contact", [
            [
              application.display_name || notSet,
              employer?.poster_role ? t(`apply.employer.contact.role.${employer.poster_role}`) : notSet,
            ].join(" · "),
          ])}
        </>
      ) : null}
    </>
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
  emptyText: {
    fontSize: 14,
    color: "#453f37",
    marginBottom: 16,
  },
  startButton: {
    backgroundColor: "#f87000",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 9999,
  },
  startButtonText: {
    color: "#00112e",
    fontWeight: "700",
    fontSize: 15,
  },
  summaryList: {
    flexDirection: "column",
    width: "100%",
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  summaryLeftCol: {
    flex: 1,
    paddingRight: 12,
  },
  summaryLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#453f37",
    marginBottom: 3,
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: "700",
    color: "#00112e",
  },
  summaryDivider: {
    height: 1,
    backgroundColor: "#f1f5f9",
  },
  editLink: {
    fontSize: 14,
    fontWeight: "600",
    color: "#c2410c",
    textDecorationLine: "underline",
    paddingVertical: 2,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 3,
  },
  badgePill: {
    backgroundColor: "#f4f1ec",
    borderRadius: 9999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  badgeText: {
    fontSize: 12.5,
    fontWeight: "500",
    color: "#453f37",
  },
  outstandingCard: {
    backgroundColor: "#fff7ed",
    borderWidth: 1,
    borderColor: "#fed7aa",
    borderRadius: 12,
    padding: 16,
    marginVertical: 16,
  },
  outstandingTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#00112e",
    marginBottom: 8,
  },
  outstandingList: {
    flexDirection: "column",
    gap: 4,
  },
  outstandingLink: {
    fontSize: 14,
    fontWeight: "600",
    color: "#00112e",
    textDecorationLine: "underline",
    paddingVertical: 2,
  },
  agreementsSection: {
    flexDirection: "column",
    marginTop: 4,
    marginBottom: 16,
  },
  agreementsHeading: {
    fontSize: 15,
    fontWeight: "700",
    color: "#00112e",
    marginBottom: 12,
  },
  agreementCard: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e7e2da",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: "#cbd5e1",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
    backgroundColor: "#ffffff",
  },
  checkboxChecked: {
    backgroundColor: "#f87000",
    borderColor: "#f87000",
  },
  checkboxUnchecked: {
    backgroundColor: "#ffffff",
    borderColor: "#cbd5e1",
  },
  agreementContent: {
    flex: 1,
    marginLeft: 12,
  },
  agreementText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#00112e",
    lineHeight: 20,
  },
  readDocumentLink: {
    fontSize: 13,
    fontWeight: "600",
    color: "#c2410c",
    textDecorationLine: "underline",
    marginTop: 4,
    alignSelf: "flex-start",
  },
  notificationCard: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e7e2da",
    borderRadius: 16,
    padding: 16,
    marginTop: 4,
    marginBottom: 8,
  },
  notificationTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  notificationIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#fff7ed",
    alignItems: "center",
    justifyContent: "center",
  },
  notificationTextContainer: {
    flex: 1,
    marginLeft: 12,
  },
  notificationTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#00112e",
    letterSpacing: -0.2,
  },
  notificationSubtitle: {
    fontSize: 13,
    color: "#453f37",
    marginTop: 4,
    lineHeight: 18,
  },
  notificationBadgeContainer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 10,
  },
  onBadgePill: {
    backgroundColor: "#e8f7ec",
    borderRadius: 9999,
    paddingHorizontal: 14,
    paddingVertical: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  onBadgeText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1b6d37",
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    width: "100%",
    maxWidth: 520,
    maxHeight: "80%",
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 20,
    ...(Platform.OS === "web"
      ? ({
          boxShadow: "0 10px 25px rgba(0, 0, 0, 0.15)",
        } as any)
      : {
          elevation: 5,
        }),
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    paddingBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#00112e",
  },
  modalVersion: {
    fontSize: 13,
    color: "#64748b",
    marginTop: 2,
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: "#f1f5f9",
  },
  modalBody: {
    paddingVertical: 16,
  },
  docBodyText: {
    fontSize: 14,
    color: "#453f37",
    lineHeight: 22,
  },
  modalFooter: {
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    paddingTop: 14,
  },
  modalAcceptButton: {
    backgroundColor: "#f87000",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  modalAcceptButtonText: {
    color: "#00112e",
    fontSize: 15,
    fontWeight: "700",
  },
  modalDismissButton: {
    backgroundColor: "#f1f5f9",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  modalDismissButtonText: {
    color: "#00112e",
    fontSize: 15,
    fontWeight: "700",
  },
});
