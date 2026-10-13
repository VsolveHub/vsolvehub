import { Badge, Button, Card, Text } from "@vsolve/mobile-ui";
import { View } from "react-native";
import { ChevronRight, Copy, MapPin, Play, RefreshCw, Users } from "lucide-react-native";

import {
  type PartnerListing,
  formatSalary,
  getListingStatusBadge,
} from "../model";

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
  const badge = getListingStatusBadge(listing.status);
  const status = (listing.status ?? "").toUpperCase();
  const isClosed = status === "CLOSED" || status === "EXPIRED";
  const isDraft = status === "DRAFT" || status === "UNPUBLISHED";
  const appCount = listing.application_count ?? 0;

  return (
    <Card className="border border-line bg-surface p-4 shadow-sm">
      <View className="flex-row items-center justify-between gap-2 border-b border-line/60 pb-3">
        <View className="flex-1">
          <Text className="text-base font-bold text-navy-900" numberOfLines={1}>
            {listing.title}
          </Text>
          <View className="mt-1 flex-row flex-wrap items-center gap-2">
            {listing.employment_type || listing.job_type ? (
              <Text className="text-xs font-semibold text-text-muted">
                {listing.employment_type || listing.job_type}
              </Text>
            ) : null}
            {listing.work_mode ? (
              <Text className="text-xs text-text-muted">· {listing.work_mode}</Text>
            ) : null}
            {listing.location || listing.city ? (
              <View className="flex-row items-center gap-0.5">
                <MapPin size={11} color="#71717a" />
                <Text className="text-xs text-text-muted">
                  {listing.location || listing.city}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
        <Badge tone={badge.tone}>{badge.label}</Badge>
      </View>

      <View className="mt-3 flex-row items-center justify-between">
        <View>
          <Text className="text-[11px] text-text-muted">Salary Range</Text>
          <Text className="text-sm font-extrabold text-amber-600">
            {formatSalary(listing.salary_min_paise, listing.salary_max_paise, listing.salary_display)}
          </Text>
        </View>

        <View className="items-end">
          <Text className="text-[11px] text-text-muted">Applications</Text>
          <View className="flex-row items-center gap-1">
            <Users size={14} color="#00112e" />
            <Text className="text-sm font-bold text-navy-900">{appCount}</Text>
          </View>
        </View>
      </View>

      {/* Action Buttons Row */}
      <View className="mt-3.5 flex-row flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-3">
        <View className="flex-row items-center gap-2">
          {/* Draft Publish Now Button (W-115) */}
          {isDraft && onPublishNow ? (
            <Button
              variant="primary"
              size="sm"
              disabled={isActionPending}
              onPress={() => onPublishNow(listing)}
              className="h-8 flex-row items-center gap-1 px-3 bg-emerald-600"
            >
              <Play size={12} color="#ffffff" />
              <Text className="text-xs font-bold text-white">Publish Now</Text>
            </Button>
          ) : null}

          {/* Closed Republish Button (W-113) */}
          {isClosed && onRepublish ? (
            <Button
              variant="primary"
              size="sm"
              disabled={isActionPending}
              onPress={() => onRepublish(listing)}
              className="h-8 flex-row items-center gap-1 px-3"
            >
              <RefreshCw size={12} color="#ffffff" />
              <Text className="text-xs font-bold text-white">Republish</Text>
            </Button>
          ) : null}

          {/* Active Close Job Button */}
          {!isClosed && !isDraft ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={isActionPending}
              onPress={() => onClose(listing)}
              className="h-8 px-2.5"
            >
              <Text className="text-xs font-semibold text-rose-600">Close</Text>
            </Button>
          ) : null}

          {/* Edit Button */}
          {onEdit ? (
            <Button
              variant="secondary"
              size="sm"
              disabled={isActionPending}
              onPress={() => onEdit(listing)}
              className="h-8 px-2.5"
            >
              <Text className="text-xs font-semibold text-navy-900">Edit</Text>
            </Button>
          ) : null}

          {/* Duplicate Button (W-114) */}
          {onDuplicate ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={isActionPending}
              onPress={() => onDuplicate(listing)}
              className="h-8 flex-row items-center gap-1 px-2"
            >
              <Copy size={12} color="#64748b" />
              <Text className="text-xs font-medium text-text-muted">Copy</Text>
            </Button>
          ) : null}
        </View>

        {/* View Candidates / Applicants */}
        <Button
          variant="primary"
          size="sm"
          onPress={() => onViewApplicants(listing)}
          className="h-8 flex-row items-center gap-1 px-3"
        >
          <Text className="text-xs font-bold text-white">
            Candidates ({appCount})
          </Text>
          <ChevronRight size={13} color="#ffffff" />
        </Button>
      </View>
    </Card>
  );
}
