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

  return (
    <View className="rounded-3xl border border-[#e2e8f0] bg-white p-5 shadow-xs">
      {/* Top Badges Row */}
      <View className="flex-row items-center justify-between">
        {/* Status Pill on Left */}
        <View className="rounded-full border border-[#a7f3d0] bg-[#ecfdf5] px-3 py-1">
          <Text className="text-xs font-semibold text-[#059669]">
            {stepLabel}
          </Text>
        </View>

        {/* Applied Date on Right */}
        <View className="flex-row items-center gap-1.5">
          <Calendar size={13} color="#64748b" />
          <Text className="text-xs text-[#64748b]">
            Applied {formatDmy(application.created_at)}
          </Text>
        </View>
      </View>

      {/* Contact Unlocked Pill (Row 2) */}
      {isContactUnlocked ? (
        <View className="mt-2.5 self-start flex-row items-center gap-1.5 rounded-full border border-[#a7f3d0] bg-[#ecfdf5] px-2.5 py-1">
          <CheckCircle2 size={13} color="#059669" />
          <Text className="text-xs font-semibold text-[#059669]">
            Contact unlocked
          </Text>
        </View>
      ) : null}

      {/* Candidate Name */}
      <Text className="mt-3 text-xl font-extrabold text-[#071328]">
        {candidateName}
      </Text>

      {/* Hiring Step Progress Badges (Orange Pills) */}
      {!closed ? (
        <View className="mt-2.5 flex-row flex-wrap items-center gap-1.5">
          {STEPS.map((name, i) => {
            const currentIdx = STEPS.indexOf(stepLabel as (typeof STEPS)[number]);
            const reached = currentIdx >= i;
            return (
              <View
                key={name}
                className={`rounded-full px-3 py-0.5 ${
                  reached ? "bg-[#ea580c]" : "bg-[#f4efe8]"
                }`}
              >
                <Text
                  className={`text-xs font-bold ${
                    reached ? "text-[#071328]" : "text-[#64748b]"
                  }`}
                >
                  {name}
                </Text>
              </View>
            );
          })}
        </View>
      ) : (
        <View className="mt-2 self-start rounded-full bg-[#f1f5f9] px-3 py-1 border border-[#e2e8f0]">
          <Text className="text-xs font-semibold text-[#64748b]">
            {status === "REJECTED" ? "Not selected" : status}
          </Text>
        </View>
      )}

      {/* Candidate Metadata */}
      <View className="mt-3 gap-1">
        {locationText ? (
          <Text className="text-xs text-[#334155]">
            <Text className="font-semibold text-[#64748b]">location: </Text>
            {locationText}
          </Text>
        ) : null}
        {jobsWanted ? (
          <Text className="text-xs text-[#334155]">
            <Text className="font-semibold text-[#64748b]">jobs wanted: </Text>
            {jobsWanted}
          </Text>
        ) : null}
        {snapshot.experience ? (
          <Text className="text-xs text-[#334155]">
            <Text className="font-semibold text-[#64748b]">experience: </Text>
            {snapshot.experience}
          </Text>
        ) : null}
      </View>

      {/* Cover Note (if provided) */}
      {application.cover_note ? (
        <View className="mt-2.5 rounded-xl border border-[#e8e2d9] bg-[#f4efe8] p-2.5">
          <Text className="text-xs italic text-[#475569]">
            “{application.cover_note}”
          </Text>
        </View>
      ) : null}

      {/* Resume Section */}
      <View className="mt-3 rounded-xl border border-[#e8e2d9]/60 bg-[#f4efe8] p-3">
        {resumeUrl ? (
          <Pressable
            onPress={handleOpenResume}
            className="flex-row items-center gap-1.5"
          >
            <Text className="text-xs font-semibold text-[#071328] underline">
              Resume Link: View Profile / CV
            </Text>
            <ExternalLink size={13} color="#071328" />
          </Pressable>
        ) : (
          <Text className="text-xs text-[#64748b]">
            No resume link provided
          </Text>
        )}
      </View>

      {/* Contact Info (Unlocked or Masked Box) */}
      <View className="mt-3 rounded-xl border border-[#e2e8f0] bg-white p-3 flex-row items-center justify-between">
        {isContactUnlocked ? (
          <>
            {phone ? (
              <Pressable
                onPress={handleCall}
                className="flex-row items-center gap-2"
              >
                <Phone size={15} color="#059669" />
                <Text className="text-sm font-bold text-[#071328]">{phone}</Text>
              </Pressable>
            ) : (
              <Text className="text-xs text-[#64748b]">No phone number on file</Text>
            )}
            <Text className="text-xs text-[#64748b]">
              Unlocked on {formatDmy(application.contact_revealed_at)}
            </Text>
          </>
        ) : (
          <>
            <View className="flex-row items-center gap-1.5 flex-1 pr-2">
              <Lock size={14} color="#64748b" />
              <Text className="text-xs text-[#64748b]" numberOfLines={1}>
                Direct contact masked
              </Text>
            </View>
            <Pressable
              onPress={() => onRevealContact(application)}
              className="rounded-lg bg-[#071328] px-3 py-1.5 flex-row items-center gap-1"
            >
              <Unlock size={12} color="#ffffff" />
              <Text className="text-xs font-bold text-white">
                Reveal Phone
              </Text>
            </Pressable>
          </>
        )}
      </View>

      {/* Status History Timeline Pills */}
      {statusEvents && statusEvents.length > 0 ? (
        <View className="mt-2.5 flex-col gap-1.5">
          {statusEvents
            .slice(-2)
            .reverse()
            .map((ev: any, idx: number) => {
              const evLabel = HIRING_STEP_LABELS[ev.to_status] || ev.to_status;
              return (
                <View
                  key={ev.id || idx}
                  className="self-start flex-row items-center gap-1.5 rounded-full border border-[#e2e8f0] bg-[#f8fafc] px-3 py-1"
                >
                  <Clock size={12} color="#64748b" />
                  <Text className="text-[11px] text-[#64748b]">
                    {evLabel} ({formatDmy(ev.created_at)})
                  </Text>
                </View>
              );
            })}
        </View>
      ) : null}

      {/* Action Buttons */}
      <View className="mt-4 flex-col gap-2.5">
        {canShortlist ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => onUpdateStatus(application, "SHORTLISTED")}
            className="w-full flex-row items-center justify-center gap-2 rounded-xl border border-[#a7f3d0] bg-[#ecfdf5] py-2.5 px-4 active:bg-[#d1fae5]"
          >
            <UserCheck size={15} color="#059669" />
            <Text className="text-sm font-bold text-[#059669]">Shortlist</Text>
          </Pressable>
        ) : null}

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
            className="w-full flex-row items-center justify-center gap-2 rounded-xl bg-[#ea580c] py-2.5 px-4 shadow-xs active:opacity-90"
          >
            <Calendar size={15} color="#071328" />
            <Text className="text-sm font-bold text-[#071328]">
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
            className="w-full flex-row items-center justify-center gap-2 rounded-xl bg-[#059669] py-2.5 px-4 active:opacity-90"
          >
            <Award size={15} color="#ffffff" />
            <Text className="text-sm font-bold text-white">Mark as hired</Text>
          </Pressable>
        ) : null}

        {canMarkConnected || canReject ? (
          <View className="flex-row gap-2">
            {canMarkConnected ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => onUpdateStatus(application, "CONNECTED")}
                className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border border-[#a7f3d0] bg-[#ecfdf5] py-2.5 px-3 active:bg-[#d1fae5]"
              >
                <CheckCircle2 size={15} color="#059669" />
                <Text className="text-xs font-bold text-[#059669]">Mark connected</Text>
              </Pressable>
            ) : null}

            {canReject ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => onUpdateStatus(application, "REJECTED")}
                className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border border-[#e2e8f0] bg-white py-2.5 px-3 active:bg-[#f8fafc]"
              >
                <UserX size={15} color="#64748b" />
                <Text className="text-xs font-semibold text-[#64748b]">Not selected</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {/* Third Row: Report button */}
        {onReport ? (
          <Pressable
            onPress={() => onReport(application)}
            className="self-start flex-row items-center justify-center gap-1.5 rounded-xl border border-[#e2e8f0] bg-white py-2 px-3.5 active:bg-[#f8fafc]"
          >
            <Flag size={13} color="#64748b" />
            <Text className="text-xs font-semibold text-[#64748b]">
              Report
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
