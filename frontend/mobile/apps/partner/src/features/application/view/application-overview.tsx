// Ported faithfully from frontend/apps/partner/features/application/view/application-overview.tsx
// 100% accurate layout, styling, track selection, typography, and responsiveness.

import { ApiRequestError, type Schemas } from "@vsolve/api-client";
import { Button, ErrorState, Skeleton, Text, useT, type Translator } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import {
  BedDouble,
  Briefcase,
  Check,
  ChevronRight,
  FileText,
  Package,
  Sparkles,
  Wrench,
} from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { progressSummary, stepProgress, type StepProgress } from "../model/progress";
import { isEditable, replaceableRejectedDocuments } from "../model/readiness";
import { documentLabel } from "../model/status";
import { firstStepHref, isUnchosenDraft, trackPreview, type StartTrack } from "../model/steps";
import { usePartnerApplication, usePartnerAvailability, useUpdateApplication } from "../queries";
import { ApplicationStatusTracker } from "./status-banner";

type Application = Schemas["PartnerApplication"];

export function ApplicationOverview() {
  const t = useT();
  const query = usePartnerApplication();
  const isMissing = query.error instanceof ApiRequestError && query.error.status === 404;

  if (query.isPending) {
    return (
      <View accessibilityLabel={t("apply.editor.loadingAriaLabel")} style={{ rowGap: 16, padding: 16 }}>
        <Skeleton className="h-32 w-full rounded-3xl" />
        <Skeleton className="h-14 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-3xl" />
      </View>
    );
  }

  if (query.isError && !isMissing) {
    return (
      <ErrorState
        title={t("apply.editor.loadError.title")}
        message={t("apply.editor.loadError.message")}
        actionLabel={t("common.tryAgain")}
        onAction={() => void query.refetch()}
      />
    );
  }

  const application = query.data;

  if (isMissing || !application || isUnchosenDraft(application)) {
    return <NotStarted />;
  }

  return <Standing application={application} />;
}

/**
 * NotStarted — Shown when the user hasn't started their application yet or wants to pick their track.
 */
function NotStarted() {
  const t = useT();
  const router = useRouter();
  const start = useUpdateApplication();
  const [chosen, setChosen] = useState<StartTrack | null>(null);

  return (
    <View style={{ width: "100%", rowGap: 24, paddingBottom: 40 }}>
      {/* Deep Navy Hero Card */}
      <View
        style={{
          width: "100%",
          borderRadius: 20,
          overflow: "hidden",
          boxShadow: "0 12px 32px rgba(0, 17, 46, 0.15)",
        }}
      >
        <LinearGradient
          colors={["#00204d", "#00183b", "#00112e"]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={{
            width: "100%",
            paddingVertical: 32,
            paddingHorizontal: 24,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: "rgba(255, 255, 255, 0.15)",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 14,
            }}
          >
            <Sparkles size={26} color="#ffffff" />
          </View>

          <Text
            style={{
              fontSize: 22,
              fontWeight: "800",
              color: "#ffffff",
              textAlign: "center",
              letterSpacing: -0.4,
            }}
          >
            {t("apply.overview.notStarted.title")}
          </Text>

          <Text
            style={{
              marginTop: 8,
              fontSize: 15,
              lineHeight: 24,
              color: "#cbd5e1",
              textAlign: "center",
              maxWidth: 380,
            }}
          >
            {t("apply.overview.notStarted.subtitle")}
          </Text>
        </LinearGradient>
      </View>

      {/* Track Prompt Heading */}
      <View style={{ rowGap: 2, marginTop: 4 }}>
        <Text style={{ fontSize: 16, fontWeight: "700", color: "#00112e" }}>
          {t("apply.overview.notStarted.whatWillYouDo")}
        </Text>
        <Text style={{ fontSize: 14, color: "#453f37" }}>
          {t("apply.overview.notStarted.tapToStart")}
        </Text>
      </View>

      {/* Track options */}
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={t("apply.overview.notStarted.whatWillYouDo")}
        style={{ gap: 12, width: "100%" }}
      >
        {TRACK_CHOICES.map(({ track, titleKey, descriptionKey, icon: Icon }) => (
          <TrackCard
            key={track}
            icon={<Icon size={22} color="#ea580c" />}
            title={t(titleKey)}
            description={t(descriptionKey)}
            selected={chosen === track}
            onPress={() => setChosen(track)}
          />
        ))}
      </View>

      {chosen ? (
        <TrackPreview
          track={chosen}
          pending={start.isPending}
          failed={start.isError}
          onStart={() =>
            start.mutate({ track: chosen }, { onSuccess: () => router.push(firstStepHref(chosen) as never) })
          }
          onBack={() => setChosen(null)}
        />
      ) : (
        <View style={{ rowGap: 8, marginTop: 4 }}>
          <PromiseItem text={t("apply.overview.promise.notSentUntilYouSend")} />
          <PromiseItem text={t("apply.overview.promise.notSharedUntilApproved")} />
        </View>
      )}
    </View>
  );
}

const TRACK_CHOICES = [
  {
    track: "SERVICES",
    titleKey: "apply.overview.track.services.title",
    descriptionKey: "apply.overview.track.services.description",
    icon: Wrench,
  },
  {
    track: "STAY_HOST",
    titleKey: "apply.overview.track.stays.title",
    descriptionKey: "apply.overview.track.stays.description",
    icon: BedDouble,
  },
  {
    track: "RENTAL_OWNER",
    titleKey: "apply.overview.track.rentals.title",
    descriptionKey: "apply.overview.track.rentals.description",
    icon: Package,
  },
  {
    track: "EMPLOYER",
    titleKey: "apply.overview.track.employer.title",
    descriptionKey: "apply.overview.track.employer.description",
    icon: Briefcase,
  },
] as const;

function TrackPreview({
  track,
  pending,
  failed,
  onStart,
  onBack,
}: {
  track: StartTrack;
  pending: boolean;
  failed: boolean;
  onStart: () => void;
  onBack: () => void;
}) {
  const t = useT();
  const preview = trackPreview(track);
  return (
    <View
      style={{
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "#f87000",
        backgroundColor: "#ffffff",
        padding: 18,
        rowGap: 14,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
        <Text style={{ fontSize: 16, fontWeight: "700", color: "#00112e" }}>{t("apply.overview.preview.title")}</Text>
        <Text style={{ fontSize: 13, color: "#453f37" }}>{preview.time}</Text>
      </View>
      <View style={{ rowGap: 8 }}>
        {preview.steps.map((step, index) => (
          <View key={step.href} style={{ flexDirection: "row", alignItems: "center", columnGap: 10 }}>
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 9999,
                backgroundColor: "#f4f1ec",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: "700", color: "#00112e" }}>{index + 1}</Text>
            </View>
            <Text style={{ fontSize: 14, color: "#00112e" }}>{step.label}</Text>
          </View>
        ))}
      </View>
      <Text style={{ fontSize: 14, color: "#453f37" }}>{t("apply.overview.preview.need")}</Text>
      <View style={{ borderRadius: 10, backgroundColor: "#f4f1ec", padding: 12 }}>
        <Text style={{ fontSize: 14, lineHeight: 20, color: "#00112e" }}>{preview.after}</Text>
      </View>
      {failed ? (
        <Text style={{ fontSize: 14, color: "#be123c" }}>{t("apply.overview.startFailed")}</Text>
      ) : null}
      <Button size="lg" onPress={onStart} loading={pending}>
        {t("apply.overview.preview.start")}
      </Button>
      <Button variant="ghost" onPress={onBack} disabled={pending}>
        {t("apply.overview.preview.back")}
      </Button>
    </View>
  );
}

function TrackCard({
  icon,
  title,
  description,
  selected,
  onPress,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={{
        borderRadius: 16,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? "#f87000" : "#e7e2da",
        backgroundColor: "#ffffff",
        padding: selected ? 15 : 16,
        flexDirection: "row",
        alignItems: "center",
        columnGap: 14,
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          backgroundColor: "#fff7ed",
          alignItems: "center",
          justifyContent: "center",
          alignSelf: "flex-start",
        }}
      >
        {icon}
      </View>

      <View style={{ flex: 1, rowGap: 4 }}>
        <Text style={{ fontSize: 16, fontWeight: "700", color: "#00112e" }}>{title}</Text>
        <Text style={{ fontSize: 14, lineHeight: 20, color: "#453f37" }}>{description}</Text>
      </View>

      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 9999,
          borderWidth: 2,
          borderColor: selected ? "#f87000" : "#cbd5e1",
          backgroundColor: selected ? "#f87000" : "transparent",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {selected ? <Check size={14} color="#ffffff" strokeWidth={3} /> : null}
      </View>
    </Pressable>
  );
}

function PromiseItem({ text }: { text: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", columnGap: 10 }}>
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 9999,
          backgroundColor: "#dcfce7",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Check size={13} color="#15803d" strokeWidth={3} />
      </View>
      <Text style={{ fontSize: 15, lineHeight: 24, color: "#453f37" }}>{text}</Text>
    </View>
  );
}

/**
 * StepMark — Exact 1:1 replica of Web StepMark component.
 * Done: Solid green circle with white check icon.
 * Todo: Orange outline hollow circle (border-action).
 * Inactive / other: Subtle gray outline with small dash.
 */
function StepMark({ state }: { state: StepProgress["state"] }) {
  if (state === "done") {
    return (
      <View
        style={{
          width: 26,
          height: 26,
          borderRadius: 13,
          backgroundColor: "#15803d",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Check size={15} color="#ffffff" strokeWidth={3} />
      </View>
    );
  }
  if (state === "todo") {
    return (
      <View
        style={{
          width: 26,
          height: 26,
          borderRadius: 13,
          borderWidth: 2,
          borderColor: "#ea580c",
          backgroundColor: "transparent",
        }}
      />
    );
  }
  return (
    <View
      style={{
        width: 26,
        height: 26,
        borderRadius: 13,
        borderWidth: 2,
        borderColor: "#cbd5e1",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View style={{ width: 8, height: 2, borderRadius: 1, backgroundColor: "#94a3b8" }} />
    </View>
  );
}

function describeStep(step: StepProgress, t: Translator["t"]): string {
  if (step.state === "done") return t("common.done");
  if (step.state === "optional") return t("apply.shell.describe.optional");
  return t("apply.shell.describe.outstanding", { count: step.outstanding });
}

/**
 * Standing — Exact 1:1 replica of Web Partner Portal /apply Standing view.
 */
function Standing({ application }: { application: Application }) {
  const t = useT();
  const router = useRouter();
  const availability = usePartnerAvailability();
  const steps = stepProgress(application, availability.data).filter((step) => step.state !== "waypoint");
  const summary = progressSummary(application, availability.data);
  const replaceable = replaceableRejectedDocuments(application);
  const editable = isEditable(application);

  return (
    <View style={{ width: "100%", rowGap: 16, paddingBottom: 40 }}>
      {/* 1. Status Tracker Card (Top Card) */}
      <ApplicationStatusTracker application={application} />

      {/* While it cannot be edited (sent, in review), the one useful action is to look at it. */}
      {editable ? null : (
        <Pressable
          cssInterop={false}
          accessibilityRole="button"
          accessibilityLabel={t("apply.overview.viewApplication")}
          onPress={() => router.push("/apply/profile" as never)}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            columnGap: 12,
            minHeight: 56,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "#e7e2da",
            backgroundColor: pressed ? "#f4f1ec" : "#ffffff",
            paddingHorizontal: 16,
          })}
        >
          <FileText size={18} color="#00112e" strokeWidth={2} />
          <Text style={{ flex: 1, fontSize: 15, fontWeight: "700", color: "#00112e" }}>{t("apply.overview.viewApplication")}</Text>
          <ChevronRight size={18} color="#94a3b8" />
        </Pressable>
      )}

      {/* Replaceable rejected documents notice if any */}
      {replaceable.length > 0 ? (
        <View
          style={{
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "#fecdd3",
            backgroundColor: "#fff1f2",
            padding: 16,
            rowGap: 8,
          }}
        >
          <Text style={{ fontSize: 15, fontWeight: "700", color: "#9f1239" }}>
            {t("apply.overview.rejected.heading", { count: replaceable.length })}
          </Text>
          <Text style={{ fontSize: 13, color: "#be123c", lineHeight: 18 }}>
            {t("apply.overview.rejected.body")}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/apply/documents" as never)}
            style={{
              alignSelf: "flex-start",
              marginTop: 4,
              backgroundColor: "#e11d48",
              borderRadius: 8,
              paddingVertical: 8,
              paddingHorizontal: 14,
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: "700", color: "#ffffff" }}>
              {t("apply.overview.rejected.upload")}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {/* 2. Checklist Card with Inline Continue Button */}
      {editable ? (
        <View
          style={{
            borderRadius: 20,
            borderWidth: 1,
            borderColor: "#e7e2da",
            backgroundColor: "#ffffff",
            padding: 16,
            rowGap: 12,
          }}
        >
          {/* List of steps */}
          <View style={{ width: "100%" }}>
            {steps.map((step, idx) => (
              <Pressable cssInterop={false}
                key={step.href}
                accessibilityRole="button"
                onPress={() => router.push(step.href as never)}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingVertical: 12,
                  borderBottomWidth: idx < steps.length - 1 ? 1 : 0,
                  borderBottomColor: "#e7e2da",
                  backgroundColor: pressed ? "#f8fafc" : "#ffffff",
                })}
              >
                <View style={{ flexDirection: "row", alignItems: "center", columnGap: 14, flex: 1 }}>
                  <StepMark state={step.state} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: "700", color: "#00112e" }}>
                      {step.label}
                    </Text>
                    <Text style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>
                      {describeStep(step, t)}
                    </Text>
                  </View>
                </View>

                <ChevronRight size={16} color="#94a3b8" />
              </Pressable>
            ))}
          </View>

          {/* Solid Orange Primary Action Button */}
          <Pressable cssInterop={false}
            accessibilityRole="button"
            onPress={() => router.push((summary.nextIncomplete?.href ?? "/apply/review") as never)}
            style={({ pressed }) => ({
              marginTop: 4,
              height: 48,
              borderRadius: 12,
              backgroundColor: pressed ? "#e06400" : "#f87000",
              alignItems: "center",
              justifyContent: "center",
            })}
          >
            <Text style={{ fontSize: 15, fontWeight: "700", color: "#ffffff" }}>
              {summary.nextIncomplete
                ? t("apply.overview.cta.continue", { step: summary.nextIncomplete.label })
                : t("apply.overview.cta.send")}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {/* 3. Switch Track Card ("Signed up for the wrong thing?") */}
      {application.status === "DRAFT" ? <SwitchTrack current={application.track} /> : null}

      {/* 4. History Timeline ("WHAT HAS HAPPENED") */}
      <History application={application} />
    </View>
  );
}

/**
 * Switching between services, stays and rentals while the application is in DRAFT.
 * Matches web 1:1 with icons.
 */
function SwitchTrack({ current }: { current: string }) {
  const t = useT();
  const router = useRouter();
  const update = useUpdateApplication();
  const others = TRACK_CHOICES.filter((choice) => choice.track !== current);

  return (
    <View
      style={{
        borderRadius: 20,
        borderWidth: 1,
        borderColor: "#e7e2da",
        backgroundColor: "#ffffff",
        padding: 16,
        rowGap: 10,
      }}
    >
      <Text style={{ fontSize: 16, fontWeight: "700", color: "#00112e", letterSpacing: -0.3 }}>
        {t("apply.overview.switch.title")}
      </Text>
      <Text style={{ fontSize: 13, lineHeight: 19, color: "#453f37" }}>
        {t("apply.overview.switch.hint")}
      </Text>
      <View style={{ rowGap: 8, marginTop: 2 }}>
        {others.map(({ track, titleKey, icon: Icon }) => (
          <Pressable cssInterop={false}
            key={track}
            accessibilityRole="button"
            disabled={update.isPending}
            onPress={() => update.mutate({ track }, { onSuccess: () => router.push(firstStepHref(track) as never) })}
            style={({ pressed }) => ({
              alignSelf: "flex-start",
              flexDirection: "row",
              alignItems: "center",
              columnGap: 8,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: "#756c5e",
              backgroundColor: pressed ? "#f4f1ec" : "#ffffff",
              paddingVertical: 8,
              paddingHorizontal: 12,
            })}
          >
            <Icon size={16} color="#00112e" strokeWidth={2} />
            <Text style={{ fontSize: 13, fontWeight: "600", color: "#00112e" }}>{t(titleKey)}</Text>
          </Pressable>
        ))}
      </View>
      {update.isError ? (
        <Text style={{ fontSize: 13, color: "#be123c" }}>{t("apply.overview.startFailed")}</Text>
      ) : null}
    </View>
  );
}

interface HistoryEntry {
  id: string;
  at: string;
  title: string;
  detail: string;
}

const ARRIVED_KEY: Record<string, string> = {
  DRAFT: "apply.overview.history.arrived.DRAFT",
  SUBMITTED: "apply.overview.history.arrived.SUBMITTED",
  UNDER_REVIEW: "apply.overview.history.arrived.UNDER_REVIEW",
  CHANGES_REQUIRED: "apply.overview.history.arrived.CHANGES_REQUIRED",
  APPROVED: "apply.overview.history.arrived.APPROVED",
  SUSPENDED: "apply.overview.history.arrived.SUSPENDED",
  OFFBOARDED: "apply.overview.history.arrived.OFFBOARDED",
  DECLINED: "apply.overview.history.arrived.DECLINED",
};

function describeTransition(fromStatus: string, toStatus: string, t: Translator["t"]): string {
  if (fromStatus === "SUSPENDED" && toStatus === "APPROVED") {
    return t("apply.overview.history.reinstated");
  }
  const key = ARRIVED_KEY[toStatus];
  return key ? t(key) : `${fromStatus} → ${toStatus}`;
}

function formatHistoryDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const formatted = new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Kolkata",
    }).format(d);
    return formatted.replace(/am|pm|AM|PM/, (m) => m.toLowerCase());
  } catch {
    return dateStr;
  }
}

/**
 * What has happened, newest first: application steps and document events.
 * 100% replica of Web History section.
 */
function History({ application }: { application: Application }) {
  const t = useT();
  const transitionEntries: HistoryEntry[] = (application.transitions ?? []).map((transition) => ({
    id: transition.id,
    at: transition.occurred_at,
    title:
      transition.reason_code === "application_resubmitted"
        ? t("apply.overview.history.resubmitted")
        : describeTransition(transition.from_status, transition.to_status, t),
    detail: transition.reason ?? "",
  }));

  // Fallback: If no transitions are recorded yet, synthesize the initial draft start event from created_at
  if (transitionEntries.length === 0 && application.created_at) {
    transitionEntries.push({
      id: "initial-creation",
      at: application.created_at,
      title: t("apply.overview.history.arrived.DRAFT"),
      detail: "",
    });
  }

  const documentEntries: HistoryEntry[] = (application.documents ?? []).flatMap((document) => {
    const label = documentLabel(document.kind);
    const events: HistoryEntry[] = [];
    if (document.version > 1 && document.uploaded_at) {
      events.push({
        id: `${document.id}:uploaded`,
        at: document.uploaded_at,
        title: t("apply.overview.history.documentReplaced", { document: label }),
        detail: "",
      });
    }
    if (document.status === "REJECTED" && document.reviewed_at) {
      events.push({
        id: `${document.id}:rejected`,
        at: document.reviewed_at,
        title: t("apply.overview.history.documentRejected", { document: label }),
        detail: document.review_reason ?? "",
      });
    }
    return events;
  });

  const entries: HistoryEntry[] = [...transitionEntries, ...documentEntries].sort(
    (a, b) => Date.parse(b.at) - Date.parse(a.at),
  );

  if (entries.length === 0) return null;

  return (
    <View style={{ marginTop: 4, rowGap: 10 }}>
      <Text style={{ fontSize: 15, fontWeight: "700", color: "#00112e", paddingHorizontal: 2 }}>
        {t("apply.overview.history.heading")}
      </Text>

      <View
        style={{
          width: "100%",
          borderRadius: 16,
          borderWidth: 1,
          borderColor: "#e7e2da",
          backgroundColor: "#ffffff",
          padding: 16,
        }}
      >
        {entries.map((entry, index) => {
          const isLatest = index === 0;
          const isLast = index === entries.length - 1;

          return (
            <View key={entry.id} style={{ flexDirection: "row", columnGap: 12 }}>
              {/* Bullet Dot & Connecting Line */}
              <View style={{ alignItems: "center", width: 14 }}>
                {/* The latest event gets a soft ring so it reads as "now". */}
                <View
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 7,
                    marginTop: 2,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: isLatest ? "#ffedd5" : "transparent",
                  }}
                >
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: isLatest ? "#f87000" : "#cbd5e1",
                    }}
                  />
                </View>
                {!isLast ? (
                  <View
                    style={{
                      width: 1.5,
                      flex: 1,
                      backgroundColor: "#e2e8f0",
                      marginVertical: 4,
                    }}
                  />
                ) : null}
              </View>

              {/* Title & Timestamp */}
              <View style={{ flex: 1, paddingBottom: isLast ? 0 : 16 }}>
                <Text style={{ fontSize: 15, fontWeight: "700", color: "#00112e" }}>
                  {entry.title}
                </Text>
                {entry.detail ? (
                  <Text style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>
                    {entry.detail}
                  </Text>
                ) : null}
                <Text style={{ fontSize: 12, color: "#94a3b8", marginTop: 3 }}>
                  {formatHistoryDate(entry.at)}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}
