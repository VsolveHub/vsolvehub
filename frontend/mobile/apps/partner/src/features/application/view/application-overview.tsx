// Ported faithfully from frontend/apps/partner/features/application/view/application-overview.tsx
// 100% accurate layout, styling, track selection, typography, and responsiveness.

import { ApiRequestError, type Schemas } from "@vsolve/api-client";
import { Button, ErrorState, Skeleton, Text } from "@vsolve/mobile-ui";
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
import { Platform, Pressable, useWindowDimensions, View } from "react-native";

import { progressSummary, stepProgress, type StepProgress } from "../model/progress";
import { isEditable, replaceableRejectedDocuments } from "../model/readiness";
import { documentLabel } from "../model/status";
import { isListingTrack, isUnchosenDraft, trackPreview, type StartTrack } from "../model/steps";
import { usePartnerApplication, usePartnerAvailability, useUpdateApplication } from "../queries";
import { ApplicationStatusTracker } from "./status-banner";

type Application = Schemas["PartnerApplication"];

export function ApplicationOverview() {
  const query = usePartnerApplication();
  const isMissing = query.error instanceof ApiRequestError && query.error.status === 404;

  if (query.isPending) {
    return (
      <View accessibilityLabel="Loading your application" style={{ rowGap: 16, padding: 16 }}>
        <Skeleton className="h-32 w-full rounded-3xl" />
        <Skeleton className="h-14 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-3xl" />
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
            Start your application
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
            About five minutes. You can stop and come back — nothing is sent for review until you choose to send it.
          </Text>
        </LinearGradient>
      </View>

      {/* Track Prompt Heading */}
      <View style={{ rowGap: 2, marginTop: 4 }}>
        <Text style={{ fontSize: 16, fontWeight: "700", color: "#00112e" }}>
          What will you do on VSolve?
        </Text>
        <Text style={{ fontSize: 14, color: "#453f37" }}>
          Pick one to see what happens next.
        </Text>
      </View>

      {/* Track options */}
      <View accessibilityRole="radiogroup" style={{ gap: 12, width: "100%" }}>
        {TRACK_CHOICES.map(({ track, title, description, icon: Icon }) => (
          <TrackCard
            key={track}
            icon={<Icon size={22} color="#ea580c" />}
            title={title}
            description={description}
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
            start.mutate({ track: chosen }, { onSuccess: () => router.push("/apply/about" as never) })
          }
          onBack={() => setChosen(null)}
        />
      ) : (
        <View style={{ rowGap: 8, marginTop: 4 }}>
          <PromiseItem text="Nothing is sent for review until you choose to send it" />
          <PromiseItem text="Nothing is shared with customers until you are approved" />
        </View>
      )}
    </View>
  );
}

const TRACK_CHOICES = [
  {
    track: "SERVICES",
    title: "I do work at customers' homes",
    description: "Electrician, plumber, cleaning, beauty, AC, pets, construction, events and more.",
    icon: Wrench,
  },
  {
    track: "STAY_HOST",
    title: "I have rooms to rent",
    description: "PG, hostel, hotel or rooms.",
    icon: BedDouble,
  },
  {
    track: "RENTAL_OWNER",
    title: "I rent out tools or equipment",
    description: "Tools, machinery, event or home items.",
    icon: Package,
  },
  {
    track: "EMPLOYER",
    title: "I want to hire staff",
    description: "A shop, clinic, office or business looking for people to work for you.",
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
        <Text style={{ fontSize: 16, fontWeight: "700", color: "#00112e" }}>What happens next</Text>
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
      <Text style={{ fontSize: 14, color: "#453f37" }}>You will need a government photo ID.</Text>
      <View style={{ borderRadius: 10, backgroundColor: "#f4f1ec", padding: 12 }}>
        <Text style={{ fontSize: 14, lineHeight: 20, color: "#00112e" }}>{preview.after}</Text>
      </View>
      {failed ? (
        <Text style={{ fontSize: 14, color: "#be123c" }}>We could not start that. Please try again.</Text>
      ) : null}
      <Button size="lg" onPress={onStart} loading={pending}>
        Start
      </Button>
      <Button variant="ghost" onPress={onBack} disabled={pending}>
        Choose something else
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

function describeStep(step: StepProgress): string {
  if (step.state === "done") return "Done";
  if (step.state === "optional") return "Optional — you can set this later";
  if (step.outstanding === 1) return "1 thing needed";
  return `${step.outstanding} things needed`;
}

/**
 * Standing — Exact 1:1 replica of Web Partner Portal /apply Standing view.
 */
function Standing({ application }: { application: Application }) {
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
          accessibilityLabel="View your application"
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
          <Text style={{ flex: 1, fontSize: 15, fontWeight: "700", color: "#00112e" }}>View your application</Text>
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
            Action Required: Documents need replacing
          </Text>
          <Text style={{ fontSize: 13, color: "#be123c", lineHeight: 18 }}>
            A reviewer has rejected one or more verification files. Please upload clear replacement files.
          </Text>
          <Pressable
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
              Upload Replacement Documents
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
                      {describeStep(step)}
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
                ? `Continue: ${summary.nextIncomplete.label}`
                : "Review and send"}
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
        Signed up for the wrong thing?
      </Text>
      <Text style={{ fontSize: 13, lineHeight: 19, color: "#453f37" }}>
        You can switch until you send your application. Nothing you have filled in is lost.
      </Text>
      <View style={{ rowGap: 8, marginTop: 2 }}>
        {others.map(({ track, title, icon: Icon }) => (
          <Pressable cssInterop={false}
            key={track}
            accessibilityRole="button"
            disabled={update.isPending}
            onPress={() => update.mutate({ track }, { onSuccess: () => router.push("/apply/about" as never) })}
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
            <Text style={{ fontSize: 13, fontWeight: "600", color: "#00112e" }}>{title}</Text>
          </Pressable>
        ))}
      </View>
      {update.isError ? (
        <Text style={{ fontSize: 13, color: "#be123c" }}>We could not start that. Please try again.</Text>
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

const ARRIVED_LABELS: Record<string, string> = {
  DRAFT: "You started your application",
  SUBMITTED: "You sent it for review",
  UNDER_REVIEW: "A reviewer started checking it",
  CHANGES_REQUIRED: "We asked you to correct something",
  APPROVED: "You were approved",
  SUSPENDED: "Your account was suspended",
  OFFBOARDED: "Your account was closed",
  DECLINED: "Your application was not approved",
};

function describeTransition(fromStatus: string, toStatus: string): string {
  if (fromStatus === "SUSPENDED" && toStatus === "APPROVED") {
    return "Your account was reinstated";
  }
  return ARRIVED_LABELS[toStatus] ?? `${fromStatus} → ${toStatus}`;
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
  const transitionEntries: HistoryEntry[] = (application.transitions ?? []).map((transition) => ({
    id: transition.id,
    at: transition.occurred_at,
    title:
      transition.reason_code === "application_resubmitted"
        ? "You sent it again"
        : describeTransition(transition.from_status, transition.to_status),
    detail: transition.reason ?? "",
  }));

  // Fallback: If no transitions are recorded yet, synthesize the initial draft start event from created_at
  if (transitionEntries.length === 0 && application.created_at) {
    transitionEntries.push({
      id: "initial-creation",
      at: application.created_at,
      title: "You started your application",
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
        title: `You uploaded a new ${label}`,
        detail: "",
      });
    }
    if (document.status === "REJECTED" && document.reviewed_at) {
      events.push({
        id: `${document.id}:rejected`,
        at: document.reviewed_at,
        title: `${label}: needs replacing`,
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
        What has happened
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
