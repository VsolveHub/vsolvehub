import { useQueries, useQuery } from "@tanstack/react-query";
import { Badge, ErrorState, Spinner, Text } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import {
  ArrowRight,
  Briefcase,
  CalendarClock,
  Plus,
  User,
  UserPlus,
  Users,
} from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { Platform, Pressable, RefreshControl, ScrollView, View } from "react-native";

import {
  fetchListingApplications,
  fetchListingHome,
  fetchPartnerListings,
} from "../queries";
import type { PartnerApplication, PartnerListing } from "../model";

const NEW = new Set(["SUBMITTED", "UNDER_REVIEW"]);
const LIVE_INTERVIEW = new Set(["PROPOSED", "ACCEPTED", "RESCHEDULE_REQUESTED"]);
const DAY_MS = 24 * 60 * 60 * 1000;
const JOBS_READ = 8;

function ago(iso?: string, now?: Date): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const curr = now ?? new Date();
    const minutes = Math.max(0, Math.round((curr.getTime() - d.getTime()) / 60000));
    if (minutes < 60) return `${minutes || 1} min ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} hr ago`;
    const days = Math.round(hours / 24);
    return days === 1 ? "Yesterday" : `${days} days ago`;
  } catch {
    return "";
  }
}

function interviewWhen(date?: string, time?: string): string {
  if (!date) return "";
  try {
    const [y, m, d] = date.split("-").map(Number);
    const [hh = 0, mm = 0] = (time || "00:00").split(":").map(Number);
    if (!y || !m || !d) return date;
    const at = new Date(y, m - 1, d, hh, mm);
    if (isNaN(at.getTime())) return date;
    const day = at.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
    const clock = at.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true }).toUpperCase();
    return `${day}, ${clock}`;
  } catch {
    return date;
  }
}

function interviewTime(app: PartnerApplication): number {
  const iv = app.interview;
  if (!iv || !iv.scheduled_date) return 0;
  try {
    const time = iv.start_time || "00:00";
    const t = new Date(`${iv.scheduled_date}T${time}`).getTime();
    return isNaN(t) ? 0 : t;
  } catch {
    return 0;
  }
}

export function ListingHome() {
  const router = useRouter();
  const [now] = useState(() => new Date());

  const summary = useQuery({
    queryKey: ["partner-listings", "home"],
    queryFn: fetchListingHome,
  });

  const listings = useQuery({
    queryKey: ["partner-listings"],
    queryFn: fetchPartnerListings,
  });

  const all = ((listings.data ?? []) as PartnerListing[]).filter((l) => l.status !== "CLOSED");
  const open = all.filter((l) => l.public_state === "PUBLISHED" || l.status === "PUBLISHED");
  const withApplicants = [...open]
    .filter((l) => (l.application_count ?? 0) > 0)
    .sort((a, b) => (b.application_count ?? 0) - (a.application_count ?? 0))
    .slice(0, JOBS_READ);

  const applications = useQueries({
    queries: withApplicants.map((listing) => ({
      queryKey: ["partner-listings", "applications", listing.id],
      queryFn: () => fetchListingApplications(listing.id),
      retry: false,
    })),
  });

  const isRefreshing = summary.isRefetching || listings.isRefetching;
  const onRefresh = () => {
    void summary.refetch();
    void listings.refetch();
    applications.forEach((q) => void q.refetch());
  };

  if (summary.isPending || listings.isPending) {
    return (
      <View className="flex-1 items-center justify-center p-8 bg-canvas">
        <Spinner size="lg" />
        <Text className="mt-3 text-sm text-text-secondary">Loading your jobs…</Text>
      </View>
    );
  }

  const failure = summary.error ?? listings.error;
  if (failure) {
    return (
      <View className="flex-1 justify-center p-6 bg-canvas">
        <ErrorState
          title="Could not load jobs"
          message={failure instanceof Error ? failure.message : "Something went wrong"}
          actionLabel="Retry"
          onAction={onRefresh}
        />
      </View>
    );
  }

  const apps = applications.flatMap((q) => (Array.isArray(q.data) ? (q.data as PartnerApplication[]) : []));
  const toReview = apps
    .filter((a) => NEW.has(a.status ?? ""))
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  const interviews = apps
    .filter((a) => a.interview && LIVE_INTERVIEW.has(a.interview.status ?? "") && interviewTime(a) >= now.getTime() - 60 * 60 * 1000)
    .sort((a, b) => interviewTime(a) - interviewTime(b));

  const withMatches = [...open]
    .filter((l) => (l.counts?.matches ?? 0) > 0)
    .sort((a, b) => (b.counts?.matches ?? 0) - (a.counts?.matches ?? 0));

  const totals = open.reduce(
    (acc, l) => ({
      views: acc.views + (l.counts?.views ?? 0),
      shortlisted: acc.shortlisted + (l.counts?.shortlisted ?? 0),
      connected: acc.connected + (l.counts?.connected ?? 0),
    }),
    { views: 0, shortlisted: 0, connected: 0 },
  );
  const h = summary.data;

  const totalMatchesCount = withMatches.reduce((sum, l) => sum + (l.counts?.matches ?? 0), 0);

  return (
    <ScrollView
      className="flex-1 bg-canvas"
      contentContainerClassName="px-4 pt-4 pb-36 gap-5"
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
    >
      {/* 2x2 Metric Stat Cards Grid - Matching Image 1 Perfectly */}
      <View className="gap-2.5">
        <View className="flex-row gap-2.5">
          <View className="flex-1">
            <TallyCard
              label="Open jobs"
              value={h?.active_listings ?? open.length}
              icon={<Briefcase size={15} color="#64748b" strokeWidth={1.8} />}
            />
          </View>
          <View className="flex-1">
            <TallyCard
              label="New applicants"
              value={h?.new_applications ?? toReview.length}
              tone="text-[#ea580c]"
              icon={<Users size={15} color="#64748b" strokeWidth={1.8} />}
            />
          </View>
        </View>

        <View className="flex-row gap-2.5">
          <View className="flex-1">
            <TallyCard
              label="Shortlisted"
              value={totals.shortlisted}
              icon={<User size={15} color="#64748b" strokeWidth={1.8} />}
            />
          </View>
          <View className="flex-1">
            <TallyCard
              label="Hired / connected"
              value={totals.connected}
              tone="text-[#15803d]"
              hint={`${totals.views} job views`}
            />
          </View>
        </View>
      </View>

      {/* Empty State Banner if no open jobs */}
      {open.length === 0 ? (
        <View
          style={{
            backgroundColor: "#ffffff",
            borderColor: "#e5e7eb",
            borderWidth: 1,
            borderRadius: 20,
          }}
          className="items-center gap-3 p-6 text-center"
        >
          <Text className="text-base font-bold text-[#071328]">No open jobs right now</Text>
          <Text className="text-center text-xs text-text-secondary leading-relaxed">
            Post a job in a couple of minutes. Matching candidates are told straight away.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/listings/post" as never)}
            className="mt-1 rounded-xl bg-[#f87000] py-2.5 px-4 active:opacity-90"
          >
            <Text className="text-xs font-bold text-white">Post a job</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Section 1: New Applicants To Review */}
      {toReview.length > 0 ? (
        <View className="gap-2.5">
          <SectionHeader
            title="NEW APPLICANTS TO REVIEW"
            icon={<Users size={15} color="#64748b" strokeWidth={1.8} />}
            count={toReview.length}
          />
          <View className="gap-2">
            {toReview.map((a) => (
              <ApplicantCard
                key={a.id || a.created_at}
                onPress={() => router.push(`/listings/${a.listing_id || a.listing || ""}` as never)}
                name={a.applicant_name || "Applicant"}
                role={a.listing_title || "Job Applicant"}
                meta={`Applied ${ago(a.created_at, now)}`}
              />
            ))}
          </View>
        </View>
      ) : null}

      {/* Section 2: Upcoming Interviews */}
      {interviews.length > 0 ? (
        <View className="gap-2.5">
          <SectionHeader
            title="UPCOMING INTERVIEWS"
            icon={<CalendarClock size={15} color="#64748b" strokeWidth={1.8} />}
            count={interviews.length}
          />
          <View className="gap-2">
            {interviews.map((a) => (
              <InterviewCard
                key={a.id || a.created_at}
                onPress={() => router.push(`/listings/${a.listing_id || a.listing || ""}` as never)}
                name={a.applicant_name || "Candidate"}
                sub={`${a.listing_title || "Interview"} · ${a.interview?.mode_label ?? ""}`}
                time={a.interview ? interviewWhen(a.interview.scheduled_date, a.interview.start_time) : ""}
                badgeText={
                  a.interview?.status === "ACCEPTED"
                    ? "Confirmed"
                    : a.interview?.status === "RESCHEDULE_REQUESTED"
                    ? "Wants another time"
                    : "Waiting for reply"
                }
                badgeTone={
                  a.interview?.status === "ACCEPTED"
                    ? "success"
                    : a.interview?.status === "RESCHEDULE_REQUESTED"
                    ? "warning"
                    : "neutral"
                }
              />
            ))}
          </View>
        </View>
      ) : (
        <View className="px-1 py-1">
          <Text className="text-xs text-[#64748b]">No interviews booked.</Text>
        </View>
      )}

      {/* Section 3: Matching Candidates You Can Invite */}
      {withMatches.length > 0 ? (
        <View className="gap-2.5">
          <SectionHeader
            title="MATCHING CANDIDATES YOU CAN INVITE"
            icon={<UserPlus size={15} color="#64748b" strokeWidth={1.8} />}
            count={totalMatchesCount}
          />
          <View className="gap-2">
            {withMatches.map((l) => (
              <MatchCandidateCard
                key={l.id}
                onPress={() => router.push(`/listings/${l.id}` as never)}
                title={l.title}
                sub={
                  summary.data?.can_see_matches
                    ? `${l.counts?.matches ?? 0} people with a strong or good match haven't applied yet`
                    : `${l.counts?.matches ?? 0} people match but haven't applied`
                }
                actionText={summary.data?.can_see_matches ? "See them" : "Upgrade"}
              />
            ))}
          </View>
        </View>
      ) : null}

      {/* Section 4: Your Open Jobs */}
      {open.length > 0 ? (
        <View className="gap-2.5">
          <SectionHeader
            title="YOUR OPEN JOBS"
            icon={<Briefcase size={15} color="#64748b" strokeWidth={1.8} />}
            count={open.length}
          />
          <View className="gap-2">
            {open.map((l) => {
              const expires = l.expires_at ? new Date(l.expires_at).getTime() - now.getTime() : null;
              const soon = expires !== null && expires > 0 && expires < 3 * DAY_MS;
              return (
                <OpenJobCard
                  key={l.id}
                  onPress={() => router.push(`/listings/${l.id}` as never)}
                  title={l.title}
                  sub={`${l.counts?.applied ?? l.application_count ?? 0} applied · ${l.counts?.shortlisted ?? 0} shortlisted · ${l.counts?.interviews ?? 0} interviews`}
                  views={`${l.counts?.views ?? 0} views`}
                  badge={
                    soon ? (
                      <Badge tone="warning">
                        Ends in {Math.ceil((expires ?? 0) / DAY_MS)}d
                      </Badge>
                    ) : null
                  }
                />
              );
            })}
          </View>
        </View>
      ) : null}

      {/* Bottom Action Buttons */}
      <View className="flex-row items-center gap-3 pt-3">
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/listings/post" as never)}
          className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl bg-[#f87000] py-3.5 px-4 shadow-sm active:opacity-90"
        >
          <Plus size={16} color="#ffffff" strokeWidth={2.5} />
          <Text className="text-sm font-bold text-white">Post a job</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/listings" as never)}
          style={{
            backgroundColor: "#ffffff",
            borderColor: "#e5e7eb",
            borderWidth: 1,
          }}
          className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl py-3.5 px-4 active:bg-slate-50"
        >
          <Text className="text-sm font-bold text-[#071328]">All jobs</Text>
          <ArrowRight size={15} color="#071328" strokeWidth={2.2} />
        </Pressable>
      </View>
    </ScrollView>
  );
}

/* 2x2 Tally Stat Card - Exact 1:1 match with Image 1 */
function TallyCard({
  label,
  value,
  tone,
  hint,
  icon,
}: {
  label: string;
  value: number;
  tone?: string;
  hint?: string;
  icon?: ReactNode;
}) {
  return (
    <View
      style={{
        backgroundColor: "#ffffff",
        borderColor: "#e5e7eb",
        borderWidth: 1,
        borderRadius: 20,
      }}
      className="p-4 flex-1 justify-between min-h-[96px]"
    >
      <View className="flex-row items-center gap-2">
        {icon}
        <Text className="text-[13px] font-semibold text-[#52525b]">{label}</Text>
      </View>
      <View className="mt-1">
        <Text
          style={Platform.OS === "android" ? { includeFontPadding: false } : undefined}
          className={`text-[28px] font-extrabold leading-none ${tone ?? "text-[#071328]"}`}
        >
          {value}
        </Text>
        {hint ? (
          <Text className="mt-1 text-[11px] font-normal text-[#64748b]">{hint}</Text>
        ) : null}
      </View>
    </View>
  );
}

/* Section Header with Icon and Solid Orange Pill Badge */
function SectionHeader({
  title,
  icon,
  count,
}: {
  title: string;
  icon: ReactNode;
  count: number;
}) {
  return (
    <View className="flex-row items-center gap-1.5 px-0.5">
      {icon}
      <Text className="text-xs font-bold uppercase tracking-wider text-[#64748b]">{title}</Text>
      {count > 0 ? (
        <View
          style={{
            backgroundColor: "#f87000",
            borderRadius: 9999,
            minWidth: 20,
            height: 20,
            paddingHorizontal: 6,
          }}
          className="items-center justify-center"
        >
          <Text className="text-[11px] font-extrabold text-white leading-none">{count}</Text>
        </View>
      ) : null}
    </View>
  );
}

/* Row 1: New Applicant Card */
function ApplicantCard({
  onPress,
  name,
  role,
  meta,
}: {
  onPress: () => void;
  name: string;
  role: string;
  meta: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        backgroundColor: "#ffffff",
        borderColor: "#e5e7eb",
        borderWidth: 1,
        borderRadius: 18,
      }}
      className="flex-row items-center justify-between px-4 py-3.5 active:bg-slate-50"
    >
      <View className="flex-1 pr-3">
        <Text className="text-base font-bold text-[#071328]" numberOfLines={1}>
          {name}
        </Text>
        <Text className="mt-0.5 text-xs text-[#64748b]" numberOfLines={1}>
          {role}
        </Text>
        <Text className="mt-1.5 text-xs font-bold text-[#071328]">{meta}</Text>
      </View>
      <View className="flex-row items-center gap-1">
        <Text className="text-sm font-bold text-[#1e3a8a]">Review</Text>
        <ArrowRight size={14} color="#1e3a8a" strokeWidth={2.4} />
      </View>
    </Pressable>
  );
}

/* Row 2: Interview Card */
function InterviewCard({
  onPress,
  name,
  sub,
  time,
  badgeText,
  badgeTone,
}: {
  onPress: () => void;
  name: string;
  sub: string;
  time: string;
  badgeText: string;
  badgeTone: "success" | "warning" | "neutral";
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        backgroundColor: "#ffffff",
        borderColor: "#e5e7eb",
        borderWidth: 1,
        borderRadius: 18,
      }}
      className="flex-row items-center justify-between px-4 py-3.5 active:bg-slate-50"
    >
      <View className="flex-1 pr-3">
        <Text className="text-base font-bold text-[#071328]" numberOfLines={1}>
          {name}
        </Text>
        <Text className="mt-0.5 text-xs text-[#64748b]" numberOfLines={1}>
          {sub}
        </Text>
        <View className="mt-1.5 flex-row items-center gap-2">
          {time ? <Text className="text-xs font-bold text-[#071328]">{time}</Text> : null}
          <Badge tone={badgeTone}>{badgeText}</Badge>
        </View>
      </View>
      <View className="flex-row items-center gap-1">
        <Text className="text-sm font-bold text-[#1e3a8a]">Details</Text>
        <ArrowRight size={14} color="#1e3a8a" strokeWidth={2.4} />
      </View>
    </Pressable>
  );
}

/* Row 3: Matching Candidates Card */
function MatchCandidateCard({
  onPress,
  title,
  sub,
  actionText,
}: {
  onPress: () => void;
  title: string;
  sub: string;
  actionText: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        backgroundColor: "#ffffff",
        borderColor: "#e5e7eb",
        borderWidth: 1,
        borderRadius: 18,
      }}
      className="flex-row items-center justify-between px-4 py-3.5 active:bg-slate-50"
    >
      <View className="flex-1 pr-3">
        <Text className="text-base font-bold text-[#071328]" numberOfLines={1}>
          {title}
        </Text>
        <Text className="mt-0.5 text-xs text-[#64748b]" numberOfLines={1}>
          {sub}
        </Text>
      </View>
      <View className="flex-row items-center gap-1">
        <Text className="text-sm font-bold text-[#1e3a8a]">{actionText}</Text>
        <ArrowRight size={14} color="#1e3a8a" strokeWidth={2.4} />
      </View>
    </Pressable>
  );
}

/* Row 4: Open Job Card */
function OpenJobCard({
  onPress,
  title,
  sub,
  views,
  badge,
}: {
  onPress: () => void;
  title: string;
  sub: string;
  views: string;
  badge?: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        backgroundColor: "#ffffff",
        borderColor: "#e5e7eb",
        borderWidth: 1,
        borderRadius: 18,
      }}
      className="flex-row items-center justify-between px-4 py-3.5 active:bg-slate-50"
    >
      <View className="flex-1 pr-3">
        <Text className="text-base font-bold text-[#071328]" numberOfLines={1}>
          {title}
        </Text>
        <Text className="mt-0.5 text-xs text-[#64748b]" numberOfLines={1}>
          {sub}
        </Text>
        <View className="mt-1 flex-row items-center gap-2">
          <Text className="text-xs font-bold text-[#071328]">{views}</Text>
          {badge}
        </View>
      </View>
      <View className="flex-row items-center gap-1">
        <Text className="text-sm font-bold text-[#1e3a8a]">Open</Text>
        <ArrowRight size={14} color="#1e3a8a" strokeWidth={2.4} />
      </View>
    </Pressable>
  );
}
