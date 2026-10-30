import {
  ArrowRight,
  Briefcase,
  CheckCircle2,
  Download,
  IndianRupee,
  MapPin,
  PauseCircle,
  Pencil,
  Play,
  RotateCcw,
  Sparkles,
  UserPlus,
  Users,
  Zap,
} from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import type { PartnerListing } from "../model";

function formatSalaryText(listing: PartnerListing): string {
  if (listing.salary_min_paise && listing.salary_min_paise > 0) {
    const minRs = Math.round(listing.salary_min_paise / 100).toLocaleString("en-IN");
    const period = listing.salary_period ? ` / ${listing.salary_period.toLowerCase()}` : "";
    if (listing.salary_max_paise && listing.salary_max_paise > listing.salary_min_paise) {
      const maxRs = Math.round(listing.salary_max_paise / 100).toLocaleString("en-IN");
      return `₹${minRs} - ₹${maxRs}${period}`;
    }
    return `₹${minRs}${period}`;
  }
  if (listing.salary_display) {
    return listing.salary_display;
  }
  if (listing.structured_fields?.salary_range) {
    return String(listing.structured_fields.salary_range);
  }
  return "";
}

function formatDateLabel(isoString?: string): string {
  if (!isoString) return "";
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return "";
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  } catch {
    return "";
  }
}

export function ListingCard({
  listing,
  onViewApplicants,
  onClose,
  onEdit,
  onPublishNow,
  onRepublish,
  onDuplicate,
  isActionPending = false,
}: {
  listing: PartnerListing;
  onViewApplicants: (listing: PartnerListing) => void;
  onClose: (listing: PartnerListing) => void;
  onEdit?: (listing: PartnerListing) => void;
  onPublishNow?: (listing: PartnerListing) => void;
  onRepublish?: (listing: PartnerListing) => void;
  onDuplicate?: (listing: PartnerListing) => void;
  isActionPending?: boolean;
}) {
  const status = (listing.status ?? "").toUpperCase();
  const isDraft = status === "DRAFT" || status === "UNPUBLISHED";
  const isClosed = status === "CLOSED" || status === "EXPIRED";
  const isLive = !isDraft && !isClosed;

  const displayPay = formatSalaryText(listing);
  const location =
    listing.location_text ||
    listing.location ||
    listing.city ||
    (listing.area ? `${listing.area}, Hyderabad` : "Hyderabad, Telangana");

  const exp =
    listing.experience ||
    listing.experience_band ||
    (listing.structured_fields?.experience_years
      ? `${listing.structured_fields.experience_years} years`
      : "1-3 years");

  const companyLine = `${listing.service_name || "Axon Analytics"} · ${
    listing.poster_name || "Open Staffing Solutions"
  }`;

  const skills = (listing.required_skills as string[] | undefined) ?? [];
  const counts = listing.counts ?? {
    views: listing.view_count ?? 0,
    applied: listing.application_count ?? 0,
    shortlisted: 0,
    interviews: 0,
    connected: 0,
    matches: 0,
  };

  const vacancies = listing.vacancies ?? 1;

  const dateText = isLive
    ? listing.expires_at
      ? `Expires ${formatDateLabel(listing.expires_at)}`
      : `Created ${formatDateLabel(listing.created_at)}`
    : isDraft
    ? "Updated 10 days ago"
    : `Closed ${formatDateLabel(listing.expires_at)}`;

  return (
    <View
      style={{
        backgroundColor: "#ffffff",
        borderColor: "#e5e7eb",
        borderWidth: 1,
        borderRadius: 20,
      }}
      className="p-4 mb-3.5"
    >
      {/* 1. Job Title */}
      <Text className="text-[17px] font-bold text-[#071328]" numberOfLines={1}>
        {listing.title}
      </Text>

      {/* 2. Company / Poster Line */}
      <Text className="mt-1 text-xs text-[#64748b]" numberOfLines={1}>
        {companyLine}
      </Text>

      {/* 3. Location & Experience Meta Row */}
      <View className="mt-1.5 flex-row flex-wrap items-center gap-3">
        {location ? (
          <View className="flex-row items-center gap-1">
            <MapPin size={12} color="#64748b" />
            <Text className="text-xs text-[#64748b]">{location}</Text>
          </View>
        ) : null}

        {exp ? (
          <View className="flex-row items-center gap-1">
            <Briefcase size={12} color="#64748b" />
            <Text className="text-xs text-[#64748b]">{exp}</Text>
          </View>
        ) : null}
      </View>

      {/* 4. Salary Row */}
      {displayPay ? (
        <View className="mt-1.5 flex-row items-center gap-1">
          <IndianRupee size={12} color="#071328" />
          <Text className="text-xs font-bold text-[#071328]">{displayPay}</Text>
        </View>
      ) : null}

      {/* 5. Vacancies Needed */}
      <Text className="mt-1.5 text-xs font-semibold text-[#071328]">
        👥 {vacancies} needed
      </Text>

      {/* 6. Skills Tags or Description Snippet */}
      {skills.length > 0 ? (
        <View className="mt-2 flex-row flex-wrap gap-1.5">
          {skills.slice(0, 5).map((skill) => (
            <View
              key={skill}
              className="rounded-lg border border-blue-200 bg-blue-50/80 px-2.5 py-0.5"
            >
              <Text className="text-xs font-semibold text-blue-700">{skill}</Text>
            </View>
          ))}
        </View>
      ) : listing.description ? (
        <Text numberOfLines={2} className="mt-2 text-xs text-[#64748b] leading-relaxed">
          {listing.description}
        </Text>
      ) : null}

      {/* 7. Status Badge & Date */}
      <View className="mt-2.5 flex-row items-center gap-2">
        {isLive ? (
          <View className="rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5">
            <Text className="text-[10px] font-bold text-emerald-700">Live on app</Text>
          </View>
        ) : isDraft ? (
          <View className="rounded-full border border-slate-300 bg-slate-100 px-2.5 py-0.5">
            <Text className="text-[10px] font-bold text-slate-700">Draft</Text>
          </View>
        ) : (
          <View className="rounded-full border border-rose-300 bg-rose-50 px-2.5 py-0.5">
            <Text className="text-[10px] font-bold text-rose-700">Closed</Text>
          </View>
        )}

        <Text className="text-[11px] text-[#64748b]">{dateText}</Text>
      </View>

      {/* 8. Activity Stats Lines */}
      <View className="mt-2 gap-0.5 border-t border-line/40 pt-2">
        <Text className="text-[11px] text-[#64748b]">
          {counts.applied} applied · {counts.shortlisted} approved · {counts.interviews} interviews
        </Text>
        <Text className="text-[11px] text-[#64748b]">
          {counts.views} views · 0 hire clicks · 0 saves · 0 shares
        </Text>
      </View>

      {/* 9. Action Buttons */}
      <View className="mt-3 gap-2">
        {/* Row 1 Actions */}
        <View className="flex-row flex-wrap items-center gap-2">
          {/* Download / View Applicants */}
          <Pressable
            accessibilityRole="button"
            onPress={() => onViewApplicants(listing)}
            style={{
              backgroundColor: "#ffffff",
              borderColor: "#e5e7eb",
              borderWidth: 1,
              borderRadius: 12,
            }}
            className="flex-row items-center gap-1.5 px-3 py-2 active:bg-slate-50"
          >
            <Download size={13} color="#071328" />
            <Text className="text-xs font-semibold text-[#071328]">
              {counts.applied > 0 ? `View applicants (${counts.applied})` : "Download applicants"}
            </Text>
          </Pressable>

          {/* Boost Repost Free */}
          <Pressable
            accessibilityRole="button"
            onPress={() => (onRepublish ? onRepublish(listing) : undefined)}
            style={{
              backgroundColor: "#ffffff",
              borderColor: "#e5e7eb",
              borderWidth: 1,
              borderRadius: 12,
            }}
            className="flex-row items-center gap-1.5 px-3 py-2 active:bg-slate-50"
          >
            <Zap size={13} color="#f87000" />
            <Text className="text-xs font-semibold text-[#071328]">
              Boost repost for free (0/3)
            </Text>
          </Pressable>

          {/* Matches Button if matches exist */}
          {counts.matches && counts.matches > 0 ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => onViewApplicants(listing)}
              style={{
                backgroundColor: "#ffffff",
                borderColor: "#e5e7eb",
                borderWidth: 1,
                borderRadius: 12,
              }}
              className="flex-row items-center gap-1.5 px-3 py-2 active:bg-slate-50"
            >
              <UserPlus size={13} color="#071328" />
              <Text className="text-xs font-semibold text-[#071328]">
                {counts.matches} Matches
              </Text>
            </Pressable>
          ) : null}
        </View>

        {/* Row 2 Actions: Pause post / Edit job / Duplicate */}
        <View className="flex-row items-center gap-2">
          {/* Pause / Close */}
          {isLive ? (
            <Pressable
              accessibilityRole="button"
              disabled={isActionPending}
              onPress={() => onClose(listing)}
              style={{
                backgroundColor: "#ffffff",
                borderColor: "#e5e7eb",
                borderWidth: 1,
                borderRadius: 12,
              }}
              className="flex-row items-center gap-1.5 px-3 py-2 active:bg-slate-50"
            >
              <PauseCircle size={13} color="#071328" />
              <Text className="text-xs font-semibold text-[#071328]">Pause post</Text>
            </Pressable>
          ) : isClosed && onRepublish ? (
            <Pressable
              accessibilityRole="button"
              disabled={isActionPending}
              onPress={() => onRepublish(listing)}
              style={{
                backgroundColor: "#ffffff",
                borderColor: "#e5e7eb",
                borderWidth: 1,
                borderRadius: 12,
              }}
              className="flex-row items-center gap-1.5 px-3 py-2 active:bg-slate-50"
            >
              <RotateCcw size={13} color="#071328" />
              <Text className="text-xs font-semibold text-[#071328]">Republish</Text>
            </Pressable>
          ) : null}

          {/* Edit Job */}
          {onEdit ? (
            <Pressable
              accessibilityRole="button"
              disabled={isActionPending}
              onPress={() => onEdit(listing)}
              style={{
                backgroundColor: "#ffffff",
                borderColor: "#e5e7eb",
                borderWidth: 1,
                borderRadius: 12,
              }}
              className="flex-row items-center gap-1.5 px-3 py-2 active:bg-slate-50"
            >
              <Pencil size={13} color="#071328" />
              <Text className="text-xs font-semibold text-[#071328]">Edit job</Text>
            </Pressable>
          ) : null}
        </View>

        {/* Draft Publish Now Full-width Orange Button */}
        {isDraft && onPublishNow ? (
          <Pressable
            accessibilityRole="button"
            disabled={isActionPending}
            onPress={() => onPublishNow(listing)}
            style={{
              backgroundColor: "#f87000",
              borderRadius: 12,
            }}
            className="flex-row items-center justify-center gap-2 py-3 px-4 shadow-sm active:opacity-90 mt-1"
          >
            <Play size={14} color="#ffffff" fill="#ffffff" />
            <Text className="text-xs font-bold text-white">Publish now</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
