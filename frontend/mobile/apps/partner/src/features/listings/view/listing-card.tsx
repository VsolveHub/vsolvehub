import { Badge, Button, Card, Text } from "@vsolve/mobile-ui";
import { View } from "react-native";
import { Briefcase, Building, MapPin, Users, ChevronRight, XCircle } from "lucide-react-native";

import {
  type PartnerListing,
  formatSalary,
  getListingStatusBadge,
} from "../model";

export function ListingCard({
  listing,
  onViewApplicants,
  onClose,
}: {
  listing: PartnerListing;
  onViewApplicants: (listing: PartnerListing) => void;
  onClose: (listing: PartnerListing) => void;
}) {
  const badge = getListingStatusBadge(listing.status);
  const isClosed = listing.status === "CLOSED";
  const appCount = listing.application_count ?? 0;

  return (
    <Card className="border border-line bg-surface p-4 shadow-sm">
      <View className="flex-row items-center justify-between gap-2 border-b border-line/60 pb-3">
        <View className="flex-1">
          <Text className="text-base font-bold text-text" numberOfLines={1}>
            {listing.title}
          </Text>
          <View className="mt-1 flex-row flex-wrap items-center gap-2">
            {listing.employment_type ? (
              <Text className="text-xs font-semibold text-text-muted">
                {listing.employment_type}
              </Text>
            ) : null}
            {listing.work_mode ? (
              <Text className="text-xs text-text-muted">· {listing.work_mode}</Text>
            ) : null}
            {listing.location ? (
              <View className="flex-row items-center gap-0.5">
                <MapPin size={11} color="#71717a" />
                <Text className="text-xs text-text-muted">{listing.location}</Text>
              </View>
            ) : null}
          </View>
        </View>
        <Badge tone={badge.tone}>{badge.label}</Badge>
      </View>

      <View className="mt-3 flex-row items-center justify-between">
        <View>
          <Text className="text-[11px] text-text-muted">Salary Range</Text>
          <Text className="text-sm font-extrabold text-[#f87000]">
            {formatSalary(listing.salary_min_paise, listing.salary_max_paise, listing.salary_display)}
          </Text>
        </View>

        <View className="items-end">
          <Text className="text-[11px] text-text-muted">Applications</Text>
          <View className="flex-row items-center gap-1">
            <Users size={14} color="#071328" />
            <Text className="text-sm font-bold text-text">{appCount}</Text>
          </View>
        </View>
      </View>

      <View className="mt-3.5 flex-row items-center justify-between border-t border-line/60 pt-3">
        {!isClosed ? (
          <Button
            variant="ghost"
            size="sm"
            onPress={() => onClose(listing)}
            className="h-8 px-2.5"
          >
            <Text className="text-xs font-semibold text-rose-600">Close Job</Text>
          </Button>
        ) : (
          <View />
        )}

        <Button
          variant="primary"
          size="sm"
          onPress={() => onViewApplicants(listing)}
          className="h-8 flex-row items-center gap-1 px-3"
        >
          <Text className="text-xs font-bold text-white">Candidates ({appCount})</Text>
          <ChevronRight size={13} color="#ffffff" />
        </Button>
      </View>
    </Card>
  );
}
