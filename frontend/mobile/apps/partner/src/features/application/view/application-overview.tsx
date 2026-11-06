// Ported faithfully from frontend/apps/partner/features/application/view/application-overview.tsx
// 100% accurate layout, styling, track selection, typography, and responsiveness.

import { ApiRequestError, type Schemas } from "@vsolve/api-client";
import { Button, ErrorState, Skeleton, Text, cn } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  BedDouble,
  Check,
  ChevronRight,
  Clock,
  FileText,
  Package,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react-native";
import { useState } from "react";
import { Platform, Pressable, ScrollView, useWindowDimensions, View } from "react-native";

import { progressSummary, stepProgress, type StepProgress } from "../model/progress";
import { canSubmit, isEditable, rejectedDocuments } from "../model/readiness";
import { isListingTrack, isUnchosenDraft, trackPreview, type StartTrack } from "../model/steps";
import { usePartnerApplication, usePartnerAvailability, useUpdateApplication } from "../queries";
import { ApplicationStatusBanner } from "./status-banner";

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

  // As on the website: the choice of how to join shows until the partner has made it. The server
  // creates an untouched Services draft on first sign-in, so "no application" alone never shows it.
  const application = query.data;

  if (isMissing || !application || isUnchosenDraft(application)) {
    return <NotStarted />;
  }

  return <Standing application={application} />;
}

/**
 * NotStarted — 100% replica of Web partner portal /apply (matching Images 1, 3, 4)
 * Shown when the user hasn't started their application yet or wants to pick their track.
 */
function NotStarted() {
  const router = useRouter();
  const start = useUpdateApplication();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 1024;

  const [chosen, setChosen] = useState<StartTrack | null>(null);

  return (
    <View style={{ width: "100%", rowGap: 24, paddingBottom: 40 }}>
      {/* 1. Deep Navy Hero Card with LinearGradient Matching Image 3 */}
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
          {/* Top Circle Sparkles Icon */}
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

      {/* 2. Track Prompt Heading */}
      <View style={{ rowGap: 2, marginTop: 4 }}>
        <Text
          style={{
            fontSize: 16,
            fontWeight: "700",
            color: "#00112e",
          }}
        >
          What will you do on VSolve?
        </Text>
        <Text
          style={{
            fontSize: 14,
            color: "#453f37",
          }}
        >
          Pick one to see what happens next.
        </Text>
      </View>

      {/* 3. The three ways to join, then what happens next for the one picked */}
      <View accessibilityRole="radiogroup" style={{ gap: 12, width: "100%" }}>
        {TRACK_CHOICES.map(({ track, title, description, Icon }) => (
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
            start.mutate({ track: chosen }, { onSuccess: () => router.push("/apply/about") })
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
    Icon: Wrench,
  },
  {
    track: "STAY_HOST",
    title: "I have rooms to rent",
    description: "PG, hostel, hotel or rooms.",
    Icon: BedDouble,
  },
  {
    track: "RENTAL_OWNER",
    title: "I rent out tools or equipment",
    description: "Tools, machinery, event or home items.",
    Icon: Package,
  },
] as const;

/** What a chosen way of joining asks for, before the applicant commits to it. */
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
      cssInterop={false}
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

/**
 * Switching between services, stays and rentals while the application is still a draft, as on
 * the website. Only in DRAFT: once a reviewer has asked for changes, it stays what they looked at.
 */
function SwitchTrack({ current }: { current: string }) {
  const router = useRouter();
  const update = useUpdateApplication();
  const others = TRACK_CHOICES.filter((choice) => choice.track !== current);

  return (
    <View
      style={{
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "#e2e8f0",
        backgroundColor: "#ffffff",
        padding: 16,
        rowGap: 10,
      }}
    >
      <Text style={{ fontSize: 14, fontWeight: "700", color: "#00112e" }}>Signed up for the wrong thing?</Text>
      <Text style={{ fontSize: 13, lineHeight: 18, color: "#64748b" }}>
        You can switch until you send your application. Nothing you have filled in is lost.
      </Text>
      {others.map(({ track, title }) => (
        <Button
          key={track}
          variant="outline"
          size="sm"
          disabled={update.isPending}
          onPress={() => update.mutate({ track }, { onSuccess: () => router.push("/apply/about") })}
        >
          {title}
        </Button>
      ))}
      {update.isError ? (
        <Text style={{ fontSize: 13, color: "#be123c" }}>We could not start that. Please try again.</Text>
      ) : null}
    </View>
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
      <Text
        style={{
          fontSize: 15,
          lineHeight: 24,
          color: "#453f37",
        }}
      >
        {text}
      </Text>
    </View>
  );
}

/**
 * Standing — Dashboard shown when application progress is in flight.
 */
function Standing({ application }: { application: Application }) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 1024;
  const availability = usePartnerAvailability();
  const steps = stepProgress(application, availability.data).filter((step) => step.state !== "waypoint");
  const summary = progressSummary(application, availability.data);
  const rejected = rejectedDocuments(application);
  const editable = isEditable(application);
  const ready = canSubmit(application, availability.data);
  const percent = Math.round(summary.fraction * 100);
  const remaining = summary.total - summary.done;
  const nextHref = ready ? "/apply/review" : (summary.nextIncomplete?.href ?? "/apply/review");

  return (
    <View style={{ width: "100%", rowGap: 24, paddingBottom: 40 }}>
      <ApplicationStatusBanner application={application} />

      {/* Responsive layout: 2 columns on desktop, stacked on mobile */}
      <View
        style={{
          flexDirection: isDesktop ? "row" : "column",
          columnGap: 24,
          rowGap: 24,
          alignItems: "flex-start",
        }}
      >
        {/* Left Column (Desktop 7-cols) */}
        <View style={{ flex: isDesktop ? 1.4 : undefined, width: "100%", rowGap: 20 }}>
          {/* Progress Hero Card */}
          {editable ? (
            <View
              style={{
                borderRadius: 20,
                overflow: "hidden",
                borderWidth: 1,
                borderColor: "rgba(255, 255, 255, 0.1)",
                boxShadow: "0 12px 32px rgba(0, 17, 46, 0.15)",
              }}
            >
              <LinearGradient
                colors={["#00204d", "#00183b", "#00112e"]}
                start={{ x: 0.1, y: 0 }}
                end={{ x: 0.9, y: 1 }}
                style={{
                  padding: isDesktop ? 28 : 20,
                  rowGap: 16,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <View style={{ flexDirection: "row", alignItems: "center", columnGap: 6 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 9999, backgroundColor: "#f87000" }} />
                    <Text style={{ fontSize: 11, fontWeight: "900", letterSpacing: 0.8, textTransform: "uppercase", color: "#fcd34d" }}>
                      Application Progress
                    </Text>
                  </View>
                  <View
                    style={{
                      borderRadius: 9999,
                      backgroundColor: "rgba(255, 255, 255, 0.1)",
                      borderWidth: 1,
                      borderColor: "rgba(255, 255, 255, 0.15)",
                      paddingHorizontal: 10,
                      paddingVertical: 3,
                    }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: "800", color: "#ffffff" }}>
                      {ready ? "All Done" : `${summary.done} of ${summary.total} Completed`}
                    </Text>
                  </View>
                </View>

                <View style={{ rowGap: 4 }}>
                  <Text style={{ fontSize: 24, fontWeight: "900", color: "#ffffff", letterSpacing: -0.5 }}>
                    {ready ? "Application Complete!" : `${remaining} ${remaining === 1 ? "step" : "steps"} remaining`}
                  </Text>
                  <Text style={{ fontSize: 13, lineHeight: 20, color: "#cbd5e1" }}>
                    {ready
                      ? "All required steps are filled. Review your details and submit for verification."
                      : `Next up: Complete your ${summary.nextIncomplete?.label.toLowerCase() ?? "profile"} to submit for fast 24h approval.`}
                  </Text>
                </View>

                {/* Progress Bar */}
                <View style={{ rowGap: 6 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ fontSize: 12, fontWeight: "600", color: "#94a3b8" }}>Overall Completion</Text>
                    <Text style={{ fontSize: 13, fontWeight: "800", color: "#fcd34d" }}>{percent}%</Text>
                  </View>
                  <View style={{ height: 8, width: "100%", borderRadius: 9999, backgroundColor: "rgba(255, 255, 255, 0.15)", overflow: "hidden" }}>
                    <View style={{ height: "100%", borderRadius: 9999, backgroundColor: "#f87000", width: `${Math.max(6, percent)}%` }} />
                  </View>
                </View>

                <Pressable cssInterop={false}
                  accessibilityRole="button"
                  onPress={() => router.push(nextHref as never)}
                  style={({ pressed }) => ({
                    height: 48,
                    borderRadius: 14,
                    backgroundColor: pressed ? "#e06400" : "#f87000",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 4px 14px rgba(248, 112, 0, 0.35)",
                  })}
                >
                  <Text style={{ fontSize: 15, fontWeight: "800", color: "#ffffff" }}>
                    {ready ? "Review & Submit Application" : `Continue to ${summary.nextIncomplete?.label ?? "Next Step"}`}
                  </Text>
                </Pressable>
              </LinearGradient>
            </View>
          ) : null}

          {application.status === "DRAFT" ? <SwitchTrack current={application.track} /> : null}

          {/* Multi-crew Contractor Option */}
          {isListingTrack(application.track) ? null : (
            <View
              style={{
                borderRadius: 20,
                borderWidth: 1,
                borderColor: "#e2e8f0",
                backgroundColor: "#ffffff",
                padding: 18,
                rowGap: 10,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", columnGap: 8 }}>
                <Text style={{ fontSize: 15, fontWeight: "800", color: "#00112e" }}>
                  Contractor & Multi-Crew Supply
                </Text>
                <View style={{ borderRadius: 9999, backgroundColor: "#f1f5f9", paddingHorizontal: 8, paddingVertical: 2 }}>
                  <Text style={{ fontSize: 10, fontWeight: "700", color: "#64748b" }}>Optional</Text>
                </View>
              </View>
              <Text style={{ fontSize: 12, lineHeight: 18, color: "#64748b" }}>
                Have a crew of 3+ technicians? Dispatch work teams and bid for custom corporate contracts.
              </Text>
              <Pressable cssInterop={false}
                accessibilityRole="button"
                onPress={() => router.push("/apply/capabilities" as never)}
                style={({ pressed }) => ({
                  alignSelf: "flex-start",
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: "#cbd5e1",
                  backgroundColor: pressed ? "#f8fafc" : "#ffffff",
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                })}
              >
                <Text style={{ fontSize: 12, fontWeight: "700", color: "#00112e" }}>
                  Explore Crew Rates
                </Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* Right Column (Desktop 5-cols): Application Checklist */}
        <View style={{ flex: isDesktop ? 1 : undefined, width: "100%", rowGap: 12 }}>
          <Text style={{ fontSize: 12, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5, color: "#00112e" }}>
            Application Checklist
          </Text>

          <View style={{ borderRadius: 20, borderWidth: 1, borderColor: "#e2e8f0", backgroundColor: "#ffffff", overflow: "hidden" }}>
            {steps.map((step, idx) => {
              const isDone = step.state === "done";
              const isFirstIncomplete = !isDone && step.href === summary.nextIncomplete?.href;

              return (
                <Pressable cssInterop={false}
                  key={step.href}
                  accessibilityRole="button"
                  onPress={() => router.push(step.href as never)}
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: 16,
                    borderBottomWidth: idx < steps.length - 1 ? 1 : 0,
                    borderColor: "#f1f5f9",
                    backgroundColor: pressed ? "#f8fafc" : "#ffffff",
                  })}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", columnGap: 12, flex: 1 }}>
                    <View
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 9999,
                        backgroundColor: isDone ? "#ecfdf5" : isFirstIncomplete ? "#fff7ed" : "#f1f5f9",
                        borderWidth: 1,
                        borderColor: isDone ? "#a7f3d0" : isFirstIncomplete ? "#fed7aa" : "#e2e8f0",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {isDone ? (
                        <Check size={14} color="#059669" strokeWidth={3} />
                      ) : (
                        <Text style={{ fontSize: 11, fontWeight: "800", color: isFirstIncomplete ? "#ea580c" : "#64748b" }}>
                          {idx + 1}
                        </Text>
                      )}
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: "700", color: "#00112e" }}>
                        {step.label}
                      </Text>
                      <Text style={{ fontSize: 11, color: "#64748b", marginTop: 1 }}>
                        {isDone ? "Completed" : isFirstIncomplete ? "Next up" : "To do"}
                      </Text>
                    </View>
                  </View>

                  <ChevronRight size={16} color="#94a3b8" />
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </View>
  );
}
