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
import { usePartnerApplication, useUpdateApplication } from "../queries";
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

  // If application is not started yet, or has no completed steps yet, show NotStarted track picker
  const application = query.data;
  const summary = application ? progressSummary(application) : null;
  const hasStarted = application && application.display_name && summary && summary.done > 0;

  if (isMissing || !application || !hasStarted) {
    return <NotStarted application={application} />;
  }

  return <Standing application={application} />;
}

/**
 * NotStarted — 100% replica of Web partner portal /apply (matching Images 1, 3, 4)
 * Shown when the user hasn't started their application yet or wants to pick their track.
 */
function NotStarted({ application }: { application?: Application }) {
  const router = useRouter();
  const start = useUpdateApplication();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 1024;

  const handleSelectTrack = (track: "SERVICES" | "STAY_HOST" | "RENTAL_OWNER") => {
    if (track === "SERVICES") {
      if (application) {
        start.mutate({ track: "SERVICES" }, { onSuccess: () => router.push("/apply/about") });
      } else {
        router.push("/apply/about");
      }
    } else {
      start.mutate({ track }, { onSuccess: () => router.push("/apply/about") });
    }
  };

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
          Tap one to start your application.
        </Text>
      </View>

      {/* 3. Track Cards Grid (3-columns on desktop, stacked on mobile) Matching Image 4 */}
      <View
        style={{
          flexDirection: isDesktop ? "row" : "column",
          gap: 12,
          width: "100%",
        }}
      >
        <TrackCard
          isDesktop={isDesktop}
          icon={<Wrench size={22} color="#ea580c" />}
          title="Offer services"
          description="Repairs, cleaning and other work at customers' homes. You choose your areas and hours."
          onPress={() => handleSelectTrack("SERVICES")}
          disabled={start.isPending}
        />

        <TrackCard
          isDesktop={isDesktop}
          icon={<BedDouble size={22} color="#ea580c" />}
          title="Stays"
          description="Rooms, PG, hostel or hotel. Just your details, the agreements and an ID — about three minutes."
          onPress={() => handleSelectTrack("STAY_HOST")}
          disabled={start.isPending}
        />

        <TrackCard
          isDesktop={isDesktop}
          icon={<Package size={22} color="#ea580c" />}
          title="Rent out items"
          description="Tools and equipment. Same short application: your details, the agreements and an ID."
          onPress={() => handleSelectTrack("RENTAL_OWNER")}
          disabled={start.isPending}
        />
      </View>

      {/* 4. Safety & Trust Checklist matching Image 4 */}
      <View style={{ rowGap: 8, marginTop: 4 }}>
        <PromiseItem text="Nothing is sent for review until you choose to send it" />
        <PromiseItem text="Nothing is shared with customers until you are approved" />
      </View>
    </View>
  );
}

function TrackCard({
  icon,
  title,
  description,
  onPress,
  disabled,
  isDesktop,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onPress: () => void;
  disabled?: boolean;
  isDesktop?: boolean;
}) {
  return (
    <Pressable cssInterop={false}
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        flex: isDesktop ? 1 : undefined,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: pressed ? "#f87000" : "#e7e2da",
        backgroundColor: "#ffffff",
        padding: 16,
        flexDirection: "row",
        alignItems: "center",
        columnGap: 14,
        boxShadow: pressed
          ? "0 4px 12px rgba(248, 112, 0, 0.15)"
          : "0 1px 2px rgba(0, 0, 0, 0.05)",
      })}
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
        <Text
          style={{
            fontSize: 16,
            fontWeight: "700",
            color: "#00112e",
          }}
        >
          {title}
        </Text>
        <Text
          style={{
            fontSize: 14,
            lineHeight: 20,
            color: "#453f37",
          }}
        >
          {description}
        </Text>
      </View>

      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 9999,
          backgroundColor: "#f4f1ec",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <ChevronRight size={18} color="#00112e" />
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
  const steps = stepProgress(application).filter((step) => step.state !== "waypoint");
  const summary = progressSummary(application);
  const rejected = rejectedDocuments(application);
  const editable = isEditable(application);
  const ready = canSubmit(application);
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

          {/* Multi-crew Contractor Option */}
          {application.track === "STAY_HOST" || application.track === "RENTAL_OWNER" ? null : (
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
