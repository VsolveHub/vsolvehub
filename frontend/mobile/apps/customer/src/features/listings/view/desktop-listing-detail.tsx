import { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useAuthStore } from "@vsolve/mobile-core";
import { Text } from "@vsolve/mobile-ui";
import {
  AlertCircle,
  ArrowLeft,
  Briefcase,
  Building,
  Check,
  CheckCircle2,
  Clock,
  FileCheck2,
  FileText,
  Flag,
  Flame,
  Heart,
  MapPin,
  ShieldCheck,
  Users,
} from "lucide-react-native";

import { DesktopSiteFooter } from "@/features/session/view/desktop-site-footer";
import { CustomerLoginSheet } from "@/features/session/customer-login-sheet";
import {
  fetchListing,
  fetchMyApplications,
  reportListing,
  type ListingDetail,
} from "../queries";
import {
  fetchMyJobProfile,
  fetchMyMatch,
  fetchSavedJobs,
  newSkillsFrom,
  quickApply,
  setJobSaved,
  type JobMatch,
  type JobProfile,
} from "../seeker-queries";
import { ReportDialog } from "./report-dialog";

const PRESET_NOTES = [
  "I am interested in this job and can join soon.",
  "I have relevant experience for this role.",
  "I live nearby and can start immediately.",
];

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "21/10/2026";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "21/10/2026";
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return "21/10/2026";
  }
}

export function DesktopListingDetail({ listing }: { listing: ListingDetail }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const authStatus = useAuthStore((s) => s.status);
  const isAuthenticated = authStatus === "signedIn";

  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("spam_or_abuse");
  const [reportDetail, setReportDetail] = useState("");
  const [loginOpen, setLoginOpen] = useState(false);

  // Quick apply form state
  const [note, setNote] = useState("");
  const [applyError, setApplyError] = useState<string | null>(null);

  const listingId = listing.id;

  const profileQuery = useQuery({
    queryKey: ["my-job-profile"],
    queryFn: fetchMyJobProfile,
    enabled: isAuthenticated,
  });

  // The applicant's own profile; until it loads (or if they have none) it is empty, never a
  // stand-in person whose skills would be offered, and saved, as theirs.
  const profile = profileQuery.data ?? ({} as JobProfile);

  const applicationsQuery = useQuery({
    queryKey: ["my-listing-applications"],
    queryFn: fetchMyApplications,
    enabled: isAuthenticated,
  });

  const myApplications = applicationsQuery.data ?? [];
  const existingApplication = myApplications.find(
    (app) =>
      (app.listing === listing.id ||
        app.listing_id === listing.id ||
        (listing.slug && app.listing_slug === listing.slug)) &&
      app.status !== "WITHDRAWN" &&
      app.status !== "EXPIRED",
  );

  const savedJobsQuery = useQuery({
    queryKey: ["saved-jobs"],
    queryFn: fetchSavedJobs,
    enabled: isAuthenticated,
  });

  const isSaved = (savedJobsQuery.data ?? []).some((j) => j.id === listingId);

  const toggleSaveMutation = useMutation({
    mutationFn: () => setJobSaved(listingId, !isSaved),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["saved-jobs"] });
    },
  });

  const matchQuery = useQuery({
    queryKey: ["my-job-match", listingId],
    queryFn: () => fetchMyMatch(listingId),
    enabled: Boolean(isAuthenticated && listingId && profileQuery.data),
  });

  const structuredFields = (listing.structured_fields || {}) as Record<string, any>;
  // Every fact on this page is the employer's own; a missing one is left out, never stood in
  // for. Only approved employers can post, so the web's "Verified Employer" is true of any.
  const posterName = listing.poster_name || listing.company_name || "Verified Employer";
  const locationText: string | null = listing.location_text || null;
  const applicationCount = listing.application_count ?? 0;
  const isFeatured =
    Boolean((listing as { is_featured?: boolean }).is_featured) ||
    (listing as { tier?: string }).tier === "SPOTLIGHT" ||
    (listing as { tier?: string }).tier === "PRIORITY" ||
    structuredFields.is_featured === "true";

  // Skills
  const rawRequired = listing.required_skills?.length
    ? listing.required_skills
    : structuredFields.required_skills;
  const requiredSkills: string[] = rawRequired && rawRequired.length > 0 ? rawRequired : [];

  const rawPreferred = listing.preferred_skills?.length
    ? listing.preferred_skills
    : structuredFields.preferred_skills;
  const preferredSkills: string[] = rawPreferred && rawPreferred.length > 0 ? rawPreferred : [];

  const allJobSkills = [...requiredSkills, ...preferredSkills];

  const profileSkills = (profile.skills as string[] | undefined) ?? [];
  const offeredSkills = newSkillsFrom([], allJobSkills);
  const alreadyHaveSet = new Set(profileSkills.map((s) => s.trim().toLowerCase()));

  const [tickedSkills, setTickedSkills] = useState<string[]>(() =>
    offeredSkills.filter((s) => alreadyHaveSet.has(s.trim().toLowerCase())),
  );

  const toggleSkill = (skill: string) => {
    setTickedSkills((prev) =>
      prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill],
    );
  };

  const applyMutation = useMutation({
    mutationFn: () => quickApply(listingId, note.trim(), tickedSkills),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["my-listing-applications"] });
      void queryClient.invalidateQueries({ queryKey: ["my-job-profile"] });
      setApplyError(null);
    },
    onError: (err: any) => {
      const msg = err?.message || "Failed to submit application. Please try again.";
      setApplyError(msg);
    },
  });

  const reportMutation = useMutation({
    mutationFn: () => reportListing(listingId, reportReason, reportDetail.trim()),
    onSuccess: () => {
      setReportOpen(false);
      setReportDetail("");
    },
  });

  const vacancies: number | null = listing.vacancies || structuredFields.vacancies || null;
  const jobType: string | null = listing.job_type || structuredFields.job_type || null;
  const shift: string | null = listing.shift || structuredFields.shift || null;
  const workMode: string | null = listing.work_mode || structuredFields.work_mode || null;
  const placeLine = [locationText, workMode].filter(Boolean).join(" · ");

  const duties: string[] =
    listing.responsibilities?.length
      ? listing.responsibilities
      : structuredFields.responsibilities?.length
        ? structuredFields.responsibilities
        : [];

  const descriptionText = listing.description?.trim() ?? "";

  // The match is the server's verdict on this applicant, so it shows only once it has one.
  const match: JobMatch | null = matchQuery.data ?? null;

  const handleApply = () => {
    if (!isAuthenticated) {
      setLoginOpen(true);
      return;
    }
    setApplyError(null);
    applyMutation.mutate();
  };

  return (
    <ScrollView
      className="flex-1 bg-[#FAF9F7]"
      contentContainerClassName="min-h-screen justify-between"
      showsVerticalScrollIndicator
    >
      <View className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        {/* Main 2-Column Responsive Layout */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            gap: 32,
            width: "100%",
          }}
          className="w-full flex-row items-start"
        >
          {/* ========================================================= */}
          {/* LEFT COLUMN: Main Job Details Card */}
          {/* ========================================================= */}
          <View style={{ flex: 7, minWidth: 0 }} className="flex-col gap-6">
            <View className="rounded-2xl border border-[#E5E1DC] bg-white p-6 shadow-xs flex-col gap-6">
              {/* Top Navigation Row: Back link & My Applications */}
              <View className="flex-row items-center justify-between">
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel="Back to open listings"
                  onPress={() => router.push("/listings")}
                  className="flex-row items-center gap-1.5 -ml-1 px-1 py-1 cursor-pointer group"
                >
                  <ArrowLeft size={16} color="#6B6560" />
                  <Text className="text-sm font-medium text-[#6B6560] group-hover:text-navy-950">
                    Back to open listings
                  </Text>
                </Pressable>

                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel="My Applications"
                  onPress={() => router.push("/listings/my-applications")}
                  className="flex-row items-center gap-1.5 px-1 py-1 cursor-pointer group"
                >
                  <FileCheck2 size={16} color="#00246B" />
                  <Text className="text-sm font-bold text-[#00246B] group-hover:underline">
                    My Applications
                  </Text>
                </Pressable>
              </View>

              {/* Meta Badges */}
              <View className="flex-row flex-wrap items-center gap-2">
                <View className="flex-row items-center gap-1.5 rounded-full bg-[#FAF8F5] border border-[#E5E1DC] px-3 py-1">
                  <Building size={13} color="#6B6560" />
                  <Text className="text-xs font-semibold text-slate-700">{posterName}</Text>
                </View>

                {isFeatured ? (
                  <View className="flex-row items-center gap-1.5 rounded-full bg-[#FFF7ED] border border-[#FFEDD5] px-2.5 py-1">
                    <View className="size-1.5 rounded-full bg-[#EA580C]" />
                    <Flame size={12} color="#EA580C" />
                    <Text className="text-xs font-bold text-[#C2410C]">Featured</Text>
                  </View>
                ) : null}

                <View className="flex-row items-center gap-1 text-slate-500 ml-1">
                  <Clock size={13} color="#94A3B8" />
                  <Text className="text-xs text-slate-500">
                    Published {formatDate(listing.published_at || (listing as any).created_at)}
                  </Text>
                </View>
              </View>

              {/* Job Title */}
              <View className="gap-1">
                <Text className="text-3xl font-extrabold tracking-tight text-navy-950">
                  {listing.title}
                </Text>
                <View className="flex-row items-center gap-2 pt-0.5">
                  {locationText ? (
                    <>
                      <View className="flex-row items-center gap-1">
                        <MapPin size={14} color="#6B6560" />
                        <Text className="text-sm font-medium text-slate-600">{locationText}</Text>
                      </View>
                      <Text className="text-slate-400">•</Text>
                    </>
                  ) : null}
                  <Text className="text-xs text-slate-500">
                    {applicationCount} {applicationCount === 1 ? "applicant" : "applicants"} applied
                  </Text>
                </View>
              </View>

              {/* Save Job Button */}
              <View className="flex-row">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={isSaved ? "Saved" : "Save job"}
                  onPress={() => {
                    if (!isAuthenticated) {
                      setLoginOpen(true);
                      return;
                    }
                    toggleSaveMutation.mutate();
                  }}
                  className={`flex-row items-center gap-1.5 rounded-full border px-4 py-2 cursor-pointer transition ${
                    isSaved
                      ? "border-[#EA580C] bg-[#FFF8F3]"
                      : "border-[#E5E1DC] bg-white hover:border-slate-400"
                  }`}
                >
                  <Heart
                    size={14}
                    color={isSaved ? "#EA580C" : "#6B6560"}
                    fill={isSaved ? "#EA580C" : "transparent"}
                  />
                  <Text
                    className={`text-xs font-semibold ${
                      isSaved ? "text-[#EA580C] font-bold" : "text-navy-950"
                    }`}
                  >
                    {isSaved ? "Saved" : "Save job"}
                  </Text>
                </Pressable>
              </View>

              {/* Match Score Card: the server's verdict, shown once it has one */}
              {match ? (
                <View className="rounded-2xl border border-[#E5E1DC] bg-[#FAF8F5] p-5 gap-3">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-2xl font-black text-navy-950">
                      {match.score}% match
                    </Text>
                    <View className="rounded-full bg-[#EFECE6] px-3 py-1 border border-[#E2DDD5]">
                      <Text className="text-xs font-bold text-navy-900">
                        {match.level === "STRONG"
                          ? "Strong match"
                          : match.level === "GOOD"
                            ? "Good match"
                            : "Some match"}
                      </Text>
                    </View>
                  </View>

                  <View className="gap-1.5 pt-0.5">
                    {(match.matched ?? []).map((m) => (
                      <Text key={m} className="text-xs font-semibold text-[#15803D]">
                        ✓ {m}
                      </Text>
                    ))}
                    {(match.missing ?? []).map((m) => (
                      <Text key={m} className="text-xs text-slate-600">
                        △ {m}
                      </Text>
                    ))}
                  </View>

                  <Text className="text-[11px] text-slate-500 pt-1">
                    Based on your profile and the job details. Please read the full job before applying.
                  </Text>
                </View>
              ) : null}

              {/* Highlight Grid: one box per fact the employer gave */}
              <View className="flex-row flex-wrap -mx-1.5 gap-y-3">
                {vacancies ? (
                  <View className="w-1/2 px-1.5">
                    <View className="flex-row items-center gap-2.5 rounded-xl border border-[#E5E1DC] bg-[#FAF8F5] p-3.5">
                      <Users size={16} color="#EA580C" />
                      <Text className="text-xs font-bold text-navy-950">
                        {vacancies} {vacancies === 1 ? "person" : "people"} needed
                      </Text>
                    </View>
                  </View>
                ) : null}

                {jobType ? (
                  <View className="w-1/2 px-1.5">
                    <View className="flex-row items-center gap-2.5 rounded-xl border border-[#E5E1DC] bg-[#FAF8F5] p-3.5">
                      <Briefcase size={16} color="#EA580C" />
                      <Text className="text-xs font-bold text-navy-950">{jobType}</Text>
                    </View>
                  </View>
                ) : null}

                {shift ? (
                  <View className="w-1/2 px-1.5">
                    <View className="flex-row items-center gap-2.5 rounded-xl border border-[#E5E1DC] bg-[#FAF8F5] p-3.5">
                      <Clock size={16} color="#EA580C" />
                      <Text className="text-xs font-bold text-navy-950">{shift}</Text>
                    </View>
                  </View>
                ) : null}

                {placeLine ? (
                  <View className="w-1/2 px-1.5">
                    <View className="flex-row items-center gap-2.5 rounded-xl border border-[#E5E1DC] bg-[#FAF8F5] p-3.5">
                      <MapPin size={16} color="#EA580C" />
                      <Text className="text-xs font-bold text-navy-950">{placeLine}</Text>
                    </View>
                  </View>
                ) : null}
              </View>

              {/* MUST HAVE Section */}
              {requiredSkills.length > 0 ? (
                <View className="gap-2 pt-1">
                  <Text className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    MUST HAVE
                  </Text>
                  <View className="flex-row flex-wrap gap-2">
                    {requiredSkills.map((skill) => (
                      <View
                        key={skill}
                        className="flex-row items-center gap-1.5 rounded-full bg-[#EEF2FB] px-3.5 py-1.5 border border-[#BFDBFE]"
                      >
                        <Text className="text-xs font-bold text-[#1E3A8A]">✓ {skill}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}

              {/* WHAT YOU WILL DO Section */}
              {duties.length > 0 ? (
                <View className="gap-2">
                  <Text className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    WHAT YOU WILL DO
                  </Text>
                  <View className="gap-1.5 pl-1">
                    {duties.map((duty, idx) => (
                      <Text key={idx} className="text-xs text-slate-700 leading-relaxed">
                        • {duty}
                      </Text>
                    ))}
                  </View>
                </View>
              ) : null}

              {/* Employer sharing note */}
              <Text className="text-xs text-slate-500 leading-relaxed">
                This job is shown based on what the employer shared. Please read the full details
                before applying.
              </Text>

              {/* JOB DESCRIPTION Section: the employer's own words, or no section */}
              {descriptionText ? (
                <View className="gap-2">
                  <Text className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    JOB DESCRIPTION
                  </Text>
                  <Text
                    numberOfLines={descriptionExpanded ? undefined : 5}
                    className="text-xs text-slate-700 leading-relaxed"
                  >
                    {descriptionText}
                  </Text>
                  <Pressable
                    onPress={() => setDescriptionExpanded((v) => !v)}
                    className="cursor-pointer self-start"
                  >
                    <Text className="text-xs font-bold text-navy-950 hover:underline">
                      {descriptionExpanded ? "Show less" : "Read more"}
                    </Text>
                  </Pressable>
                </View>
              ) : null}

              {/* Privacy-Protected Contact Exchange Box */}
              <View className="rounded-2xl border border-blue-200 bg-[#F0F4FD] p-4.5 gap-1.5">
                <View className="flex-row items-center gap-2">
                  <ShieldCheck size={16} color="#00112E" />
                  <Text className="text-sm font-bold text-navy-950">
                    Privacy-Protected Contact Exchange
                  </Text>
                </View>
                {listing.contact_masked?.phone || listing.contact_masked?.email ? (
                  <Text className="text-xs text-slate-700 leading-relaxed">
                    Hiring contact info:{" "}
                    <Text className="font-mono font-medium text-navy-950">
                      {[listing.contact_masked?.phone, listing.contact_masked?.email].filter(Boolean).join(" | ")}
                    </Text>
                  </Text>
                ) : null}
                <Text className="text-[11px] text-slate-500 leading-relaxed">
                  Neither your direct phone nor email is published publicly. Verified posters unlock
                  candidate details only for legitimate recruitment interviews.
                </Text>
              </View>

              {/* Report Listing Trigger */}
              <View className="border-t border-slate-100 pt-3">
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setReportOpen(true)}
                  className="flex-row items-center gap-1.5 cursor-pointer self-start group"
                >
                  <Flag size={13} color="#94A3B8" />
                  <Text className="text-xs font-medium text-slate-500 group-hover:text-navy-900 group-hover:underline">
                    Report suspicious or abusive job listing
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>

          {/* ========================================================= */}
          {/* RIGHT COLUMN: Sticky "Apply with your V Solve Hub profile" */}
          {/* ========================================================= */}
          <View
            style={{
              flex: 5,
              minWidth: 0,
              position: Platform.OS === "web" ? ("sticky" as any) : "relative",
              top: 24,
              alignSelf: "flex-start",
              zIndex: 10,
            }}
            className="sticky top-6 self-start"
          >
            <View className="rounded-2xl border border-[#E5E1DC] bg-white p-6 shadow-sm flex-col gap-4">
              {/* Header */}
              <View>
                <Text className="text-lg font-bold text-navy-950">
                  Apply with your V Solve Hub profile
                </Text>
                <Text className="text-xs text-slate-500 mt-0.5">No forms to fill again.</Text>
              </View>

              {/* Existing Application Banner */}
              {existingApplication || applyMutation.isSuccess ? (
                <View className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 items-center text-center gap-2">
                  <CheckCircle2 size={32} color="#059669" />
                  <Text className="text-sm font-bold text-emerald-950">Application sent</Text>
                  <Text className="text-xs text-center text-emerald-800 leading-relaxed">
                    {posterName} has your profile. You&apos;ll be notified when they shortlist you.
                  </Text>
                  <Pressable
                    accessibilityRole="link"
                    onPress={() => router.push("/listings/my-applications")}
                    className="mt-2 rounded-xl bg-emerald-700 px-4 py-2 cursor-pointer"
                  >
                    <Text className="text-xs font-bold text-white">
                      Track in My Applications →
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <>
                  {/* Candidate Profile Box */}
                  <View className="rounded-xl border border-[#E5E1DC] bg-[#FAF8F5] p-3.5 gap-0.5">
                    <Text className="text-sm font-bold text-navy-950">
                      {profile.full_name || profile.name || "Your job profile"}
                    </Text>
                    <Text className="text-xs text-slate-600">
                      {[
                        (profile.roles || []).join(", "),
                        [profile.area, profile.city]
                          .filter(Boolean)
                          .join(", "),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                    {profile.resume_name ? (
                      <View className="mt-1 flex-row items-center gap-1">
                        <FileText size={11} color="#6B6560" />
                        <Text className="text-[11px] text-slate-500">{profile.resume_name}</Text>
                      </View>
                    ) : null}
                    <Pressable
                      accessibilityRole="link"
                      onPress={() => router.push("/listings/profile")}
                      className="mt-1.5 self-start cursor-pointer"
                    >
                      <Text className="text-xs font-bold text-[#00246B] hover:underline">
                        Edit profile
                      </Text>
                    </Pressable>
                  </View>

                  {/* Which of these skills do you have? */}
                  {offeredSkills.length > 0 ? (
                    <View className="gap-2">
                      <Text className="text-xs font-bold text-navy-950">
                        Which of these skills do you have?
                      </Text>
                      <Text className="text-[11px] text-slate-500 -mt-1 leading-relaxed">
                        Ticked skills are added to your profile, so you also match jobs like this
                        one.
                      </Text>

                      <View className="flex-row flex-wrap gap-2 pt-1">
                        {offeredSkills.map((skill) => {
                          const isChecked = tickedSkills.includes(skill);
                          return (
                            <Pressable
                              key={skill}
                              onPress={() => toggleSkill(skill)}
                              className={`flex-row items-center gap-2 rounded-full border px-3.5 py-1.5 cursor-pointer transition ${
                                isChecked
                                  ? "border-navy-900 bg-[#0B1B3D]"
                                  : "border-slate-300 bg-white hover:border-slate-400"
                              }`}
                            >
                              <View
                                className={`size-3.5 rounded items-center justify-center border ${
                                  isChecked
                                    ? "border-white bg-white"
                                    : "border-slate-400 bg-transparent"
                                }`}
                              >
                                {isChecked ? <Check size={10} color="#0B1B3D" strokeWidth={3} /> : null}
                              </View>
                              <Text
                                className={`text-xs font-semibold ${
                                  isChecked ? "text-white" : "text-slate-700"
                                }`}
                              >
                                {skill}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  ) : null}

                  {/* Message (optional) */}
                  <View className="gap-2">
                    <Text className="text-xs font-bold text-navy-950">Message (optional)</Text>
                    <View className="flex-col gap-1.5">
                      {PRESET_NOTES.map((preset) => (
                        <Pressable
                          key={preset}
                          onPress={() => setNote(preset)}
                          className={`rounded-full border px-3 py-1.5 cursor-pointer transition ${
                            note === preset
                              ? "border-[#EA580C] bg-[#FFF8F3]"
                              : "border-slate-200 bg-[#FAF8F5] hover:border-slate-400"
                          }`}
                        >
                          <Text
                            className={`text-xs ${
                              note === preset
                                ? "font-bold text-[#EA580C]"
                                : "font-medium text-slate-600"
                            }`}
                          >
                            {preset}
                          </Text>
                        </Pressable>
                      ))}
                    </View>

                    {/* Or write your own textarea */}
                    <TextInput
                      multiline
                      numberOfLines={3}
                      maxLength={2000}
                      value={note}
                      onChangeText={setNote}
                      placeholder="Or write your own"
                      placeholderTextColor="#94A3B8"
                      className="min-h-20 rounded-xl border border-[#E5E1DC] bg-[#FAF8F5] p-3 text-xs text-navy-900"
                    />
                  </View>

                  {/* Apply Error Alert */}
                  {applyError ? (
                    <View className="rounded-xl border border-red-200 bg-red-50 p-3 flex-row items-center gap-2">
                      <AlertCircle size={14} color="#DC2626" />
                      <Text className="text-xs font-semibold text-red-700 flex-1">
                        {applyError}
                      </Text>
                    </View>
                  ) : null}

                  {/* Large Orange CTA Button */}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Apply now"
                    disabled={applyMutation.isPending}
                    onPress={handleApply}
                    className="w-full items-center justify-center rounded-xl bg-[#EA580C] hover:bg-[#D94E08] py-3.5 active:bg-[#C2410C] cursor-pointer shadow-sm transition"
                  >
                    {applyMutation.isPending ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Text className="text-sm font-bold text-white">Apply now</Text>
                    )}
                  </Pressable>

                  {/* Subtitle footer note */}
                  <Text className="text-[11px] text-slate-500 text-center -mt-1">
                    Your name, phone and profile are shared with this employer.
                  </Text>
                </>
              )}
            </View>
          </View>
        </View>
      </View>

      {/* Report Listing Dialog Modal */}
      <ReportDialog
        isOpen={reportOpen}
        onClose={() => setReportOpen(false)}
        reason={reportReason}
        onReasonChange={setReportReason}
        detail={reportDetail}
        onDetailChange={setReportDetail}
        onSubmit={() => reportMutation.mutate()}
        isPending={reportMutation.isPending}
        error={reportMutation.error ? (reportMutation.error as Error).message : undefined}
      />

      {/* Login Sheet if not signed in */}
      <CustomerLoginSheet
        open={loginOpen}
        onOpenChange={setLoginOpen}
        onSuccess={() => {
          setLoginOpen(false);
          handleApply();
        }}
      />

      {/* Desktop Site Footer */}
      <DesktopSiteFooter />
    </ScrollView>
  );
}

