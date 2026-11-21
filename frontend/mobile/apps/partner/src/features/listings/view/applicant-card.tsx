import { Alert, Linking, Pressable, View } from "react-native";
import { Text } from "@vsolve/mobile-ui";
import {
  Award,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  Flag,
  Lock,
  Phone,
  Unlock,
  UserCheck,
  UserX,
} from "lucide-react-native";

import {
  type PartnerApplication,
  snapshotFields,
} from "../model";
import { HIRING_STEP_LABELS } from "../jobs-queries";

function formatDmy(dateStr?: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

const STEPS = ["Applied", "Shortlisted", "Interview", "Connected", "Hired"] as const;

export interface ApplicantCardProps {
  application: PartnerApplication;
  onUpdateStatus: (application: PartnerApplication, newStatus: string) => void;
  onRevealContact: (application: PartnerApplication) => void;
  onScheduleInterview?: (application: PartnerApplication) => void;
  onReport?: (application: PartnerApplication) => void;
}

export function ApplicantCard({
  application,
  onUpdateStatus,
  onRevealContact,
  onScheduleInterview,
  onReport,
}: ApplicantCardProps) {
  const status = (application.status ?? "SUBMITTED").toUpperCase();
  const stepLabel = HIRING_STEP_LABELS[status] ?? status;
  const closed = ["REJECTED", "WITHDRAWN", "EXPIRED"].includes(status);
  // Which actions fit this applicant's stage, the same rules as the website's applicant card.
  // Hired is final too: the steps stay, the stage actions go. These follow the server's
  // allowed moves, the same as the website's applicant card.
  const decided = closed || status === "HIRED";
  const canShortlist = !decided && (status === "SUBMITTED" || status === "UNDER_REVIEW");
  const canInterview = !decided && status !== "CONNECTED";
  const canReject = !decided;
  const canMarkConnected = status === "INTERVIEW" || status === "CONTACTED";
  const canMarkHired = status === "INTERVIEW" || status === "CONTACTED" || status === "CONNECTED";
  const isContactUnlocked = !!application.contact_revealed_at;
  const snapshot = snapshotFields(application.applicant_snapshot);

  const candidateName =
    application.applicant_name ||
    application.candidate_name ||
    snapshot.name ||
    "Applicant";

  const phone =
    application.applicant_phone ||
    application.candidate_phone ||
    snapshot.phone ||
    "";

  const locationText =
    snapshot.location ||
    snapshot.area ||
    snapshot.city ||
    (application as any).location_text ||
    null;

  // What the candidate said, or the role they applied for: never a stand-in.
  const jobsWanted =
    snapshot.jobs_wanted ||
    snapshot.role ||
    snapshot.desired_roles ||
    application.listing_title ||
    null;

  const resumeUrl =
    application.resume_url ||
    snapshot.resume_url ||
    snapshot.portfolio_url;

  const handleCall = () => {
    if (phone) {
      void Linking.openURL(`tel:${phone}`);
    } else {
      Alert.alert("Contact Hidden", "Please reveal candidate contact first.");
    }
  };

  const handleOpenResume = () => {
    if (resumeUrl) {
      void Linking.openURL(resumeUrl);
    }
  };

  // Status events in order
  const statusEvents = (application as any).status_events ?? [];

  const currentIdx = STEPS.indexOf(stepLabel as (typeof STEPS)[number]);
  const details = [
    { label: "Location", value: locationText },
    { label: "Jobs wanted", value: jobsWanted },
    { label: "Experience", value: snapshot.experience },
  ].filter((row) => row.value);

  return (
    <View className="rounded-2xl border border-line bg-surface p-4">
      {/* Header: avatar, name, applied date, current stage */}
      <View className="flex-row items-start gap-3">
        <View className="size-11 items-center justify-center rounded-full bg-surface-sunken">
          <Text className="text-base font-bold text-text">{candidateName.trim().charAt(0).toUpperCase()}</Text>
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-lg font-semibold text-text" numberOfLines={1}>
            {candidateName}
          </Text>
          <View className="mt-0.5 flex-row items-center gap-1.5">
            <Calendar size={12} color="#756c5e" />
            <Text className="text-xs text-text-muted">Applied {formatDmy(application.created_at)}</Text>
          </View>
        </View>
        {closed ? (
          <View className="rounded-full bg-surface-sunken px-2.5 py-1">
            <Text className="text-xs font-semibold text-text-secondary">
              {status === "REJECTED" ? "Not selected" : status}
            </Text>
          </View>
        ) : (
          <View className="rounded-full bg-success-surface px-2.5 py-1">
            <Text className="text-xs font-semibold text-success-text">{stepLabel}</Text>
          </View>
        )}
      </View>

      {/* Hiring progress: one bar and one label per stage */}
      {!closed ? (
        <View className="mt-4 flex-row gap-2">
          {STEPS.map((name, i) => {
            const reached = currentIdx >= i;
            return (
              <View key={name} className="flex-1 gap-1.5">
                <View className={`h-1 rounded-full ${reached ? "bg-signal-500" : "bg-line"}`} />
                <Text
                  numberOfLines={1}
                  className={`text-[11px] ${i === currentIdx ? "font-semibold text-text" : "text-text-muted"}`}
                >
                  {name}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}

      {/* Candidate details */}
      {details.length > 0 ? (
        <View className="mt-4 gap-2 border-t border-line pt-4">
          {details.map((row) => (
            <View key={row.label} className="flex-row gap-3">
              <Text className="w-24 text-sm text-text-muted">{row.label}</Text>
              <Text className="flex-1 text-sm text-text">{row.value}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* Cover note (if provided) */}
      {application.cover_note ? (
        <View className="mt-4 border-l-2 border-line pl-3">
          <Text className="text-sm italic leading-5 text-text-secondary">“{application.cover_note}”</Text>
        </View>
      ) : null}

      {/* Resume and contact */}
      <View className="mt-4 overflow-hidden rounded-xl border border-line">
        <View className="px-3.5 py-3">
          {resumeUrl ? (
            <Pressable onPress={handleOpenResume} className="flex-row items-center gap-2">
              <ExternalLink size={15} color="#071328" />
              <Text className="text-sm font-medium text-text">Resume Link: View Profile / CV</Text>
            </Pressable>
          ) : (
            <Text className="text-sm text-text-muted">No resume link provided</Text>
          )}
        </View>
        <View className="flex-row items-center justify-between gap-3 border-t border-line bg-surface-sunken px-3.5 py-3">
          {isContactUnlocked ? (
            <>
              {phone ? (
                <Pressable onPress={handleCall} className="flex-row items-center gap-2">
                  <Phone size={15} color="#0e7c3a" />
                  <Text className="text-sm font-semibold text-text">{phone}</Text>
                </Pressable>
              ) : (
                <Text className="text-sm text-text-muted">No phone number on file</Text>
              )}
              <View className="flex-row items-center gap-1">
                <CheckCircle2 size={13} color="#0e7c3a" />
                <Text className="text-xs font-medium text-success-text">Contact unlocked</Text>
              </View>
            </>
          ) : (
            <>
              <View className="flex-1 flex-row items-center gap-2">
                <Lock size={15} color="#756c5e" />
                <Text className="text-sm text-text-muted" numberOfLines={1}>
                  Direct contact masked
                </Text>
              </View>
              <Pressable
                onPress={() => onRevealContact(application)}
                className="min-h-9 flex-row items-center gap-1.5 rounded-lg bg-navy-900 px-3.5 active:opacity-90"
              >
                <Unlock size={13} color="#ffffff" />
                <Text className="text-sm font-semibold text-white">Reveal Phone</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>

      {/* Recent status changes */}
      {statusEvents && statusEvents.length > 0 ? (
        <View className="mt-3 gap-1.5">
          {statusEvents
            .slice(-2)
            .reverse()
            .map((ev: any, idx: number) => {
              const evLabel = HIRING_STEP_LABELS[ev.to_status] || ev.to_status;
              return (
                <View key={ev.id || idx} className="flex-row items-center gap-1.5">
                  <Clock size={12} color="#756c5e" />
                  <Text className="text-xs text-text-muted">
                    {evLabel} ({formatDmy(ev.created_at)})
                  </Text>
                </View>
              );
            })}
        </View>
      ) : null}

      {/* Actions: the main next step first, the rest quieter */}
      <View className="mt-4 gap-2.5">
        {canInterview ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              if (onScheduleInterview) {
                onScheduleInterview(application);
              } else {
                onUpdateStatus(application, "INTERVIEW");
              }
            }}
            className="min-h-12 flex-row items-center justify-center gap-2 rounded-xl bg-signal-500 px-4 active:opacity-90"
          >
            <Calendar size={16} color="#071328" />
            <Text className="text-sm font-semibold text-text">
              {application.interview && application.interview.status !== "CANCELLED"
                ? "New interview time"
                : "Schedule interview"}
            </Text>
          </Pressable>
        ) : null}

        {canMarkHired ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => onUpdateStatus(application, "HIRED")}
            className="min-h-12 flex-row items-center justify-center gap-2 rounded-xl bg-success px-4 active:opacity-90"
          >
            <Award size={16} color="#ffffff" />
            <Text className="text-sm font-semibold text-white">Mark as hired</Text>
          </Pressable>
        ) : null}

        {canShortlist || canMarkConnected || canReject ? (
          <View className="flex-row gap-2.5">
            {canShortlist ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => onUpdateStatus(application, "SHORTLISTED")}
                className="min-h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border border-success-line bg-success-surface px-3 active:opacity-80"
              >
                <UserCheck size={15} color="#0e7c3a" />
                <Text className="text-sm font-semibold text-success-text">Shortlist</Text>
              </Pressable>
            ) : null}

            {canMarkConnected ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => onUpdateStatus(application, "CONNECTED")}
                className="min-h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border border-success-line bg-success-surface px-3 active:opacity-80"
              >
                <CheckCircle2 size={15} color="#0e7c3a" />
                <Text className="text-sm font-semibold text-success-text">Mark connected</Text>
              </Pressable>
            ) : null}

            {canReject ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => onUpdateStatus(application, "REJECTED")}
                className="min-h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border border-line bg-surface px-3 active:bg-surface-hover"
              >
                <UserX size={15} color="#756c5e" />
                <Text className="text-sm font-medium text-text-secondary">Not selected</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {onReport ? (
          <Pressable
            onPress={() => onReport(application)}
            className="min-h-9 flex-row items-center justify-center gap-1.5 self-center px-3 active:opacity-70"
          >
            <Flag size={13} color="#756c5e" />
            <Text className="text-xs font-medium text-text-muted">Report</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
