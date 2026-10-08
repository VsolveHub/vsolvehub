import { useQuery } from "@tanstack/react-query";
import { Badge, EmptyState, ErrorState, Skeleton, Text } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { Briefcase, FileCheck2, Filter, MapPin, Search, UserCircle } from "lucide-react-native";
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, TextInput, View } from "react-native";

import { fetchListingFilters, fetchListings, type Listing } from "../queries";
import { JobCard } from "./job-card";

export function ListingsBrowseScreen() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [employmentType, setEmploymentType] = useState<string>("");
  const [workMode, setWorkMode] = useState<string>("");

  const filtersQuery = useQuery({
    queryKey: ["listing-filters"],
    queryFn: fetchListingFilters,
    staleTime: 60_000,
  });

  const listingsQuery = useQuery({
    queryKey: ["listings", searchQuery, locationQuery, employmentType, workMode],
    queryFn: () =>
      fetchListings({
        q: searchQuery || undefined,
        location: locationQuery || undefined,
        employment_type: employmentType || undefined,
        work_mode: workMode || undefined,
      }),
    staleTime: 30_000,
  });

  const listings = (listingsQuery.data as Listing[]) ?? [];

  return (
    <ScrollView
      className="flex-1 bg-canvas"
      contentContainerClassName="gap-6 px-4 py-4 pb-12"
      refreshControl={
        <RefreshControl
          refreshing={listingsQuery.isRefetching}
          onRefresh={() => void listingsQuery.refetch()}
        />
      }
    >
      {/* Hero Header */}
      <View className="overflow-hidden rounded-3xl bg-[#00112e] p-6 shadow-md">
        <View className="gap-2">
          <View className="self-start rounded-full bg-brand/20 px-3 py-1">
            <Text className="text-[10px] font-extrabold uppercase tracking-wider text-brand">
              Careers & Local Listings
            </Text>
          </View>
          <Text className="text-2xl font-black text-white">Find Your Next Job</Text>
          <Text className="text-xs font-medium leading-relaxed text-white/70">
            Direct job openings with verified companies and service partners. Quick apply with your
            saved profile.
          </Text>
        </View>

        <View className="mt-4 flex-row gap-2">
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/listings/my-applications" as never)}
            className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border border-white/20 bg-white/10 py-2.5 active:bg-white/20"
          >
            <FileCheck2 size={14} color="#ffffff" />
            <Text className="text-xs font-bold text-white">My Applications</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/listings/profile" as never)}
            className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border border-white/20 bg-white/10 py-2.5 active:bg-white/20"
          >
            <UserCircle size={14} color="#ffffff" />
            <Text className="text-xs font-bold text-white">Job Profile</Text>
          </Pressable>
        </View>
      </View>

      {/* Search Bar */}
      <View className="gap-2 rounded-2xl border border-line bg-surface p-3 shadow-xs">
        <View className="flex-row items-center rounded-xl bg-canvas px-3 py-2">
          <Search size={16} color="#6B6560" />
          <TextInput
            placeholder="Search role title, technician, driver..."
            placeholderTextColor="rgba(107,101,96,0.6)"
            value={searchQuery}
            onChangeText={setSearchQuery}
            className="ml-2 flex-1 text-xs text-navy-900"
          />
        </View>
        <View className="flex-row items-center rounded-xl bg-canvas px-3 py-2">
          <MapPin size={16} color="#6B6560" />
          <TextInput
            placeholder="Location or city..."
            placeholderTextColor="rgba(107,101,96,0.6)"
            value={locationQuery}
            onChangeText={setLocationQuery}
            className="ml-2 flex-1 text-xs text-navy-900"
          />
        </View>
      </View>

      {/* Employment Type Pills */}
      <View className="gap-2">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2"
        >
          <Pressable
            onPress={() => {
              setEmploymentType("");
              setWorkMode("");
            }}
            className={`rounded-full px-4 py-2 border ${
              employmentType === "" && workMode === ""
                ? "border-navy-900 bg-navy-900"
                : "border-line bg-surface active:bg-surface-hover"
            }`}
          >
            <Text
              className={`text-xs font-bold ${
                employmentType === "" && workMode === "" ? "text-white" : "text-text-secondary"
              }`}
            >
              All Jobs
            </Text>
          </Pressable>

          {["FULL_TIME", "PART_TIME", "CONTRACT"].map((type) => (
            <Pressable
              key={type}
              onPress={() => setEmploymentType(employmentType === type ? "" : type)}
              className={`rounded-full px-4 py-2 border ${
                employmentType === type
                  ? "border-navy-900 bg-navy-900"
                  : "border-line bg-surface active:bg-surface-hover"
              }`}
            >
              <Text
                className={`text-xs font-bold capitalize ${
                  employmentType === type ? "text-white" : "text-text-secondary"
                }`}
              >
                {type.toLowerCase().replaceAll("_", " ")}
              </Text>
            </Pressable>
          ))}

          {["ON_SITE", "REMOTE", "HYBRID"].map((mode) => (
            <Pressable
              key={mode}
              onPress={() => setWorkMode(workMode === mode ? "" : mode)}
              className={`rounded-full px-4 py-2 border ${
                workMode === mode
                  ? "border-brand bg-brand"
                  : "border-line bg-surface active:bg-surface-hover"
              }`}
            >
              <Text
                className={`text-xs font-bold capitalize ${
                  workMode === mode ? "text-white" : "text-text-secondary"
                }`}
              >
                {mode.toLowerCase().replaceAll("_", " ")}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* Results Header */}
      <View className="flex-row items-center justify-between">
        <Text className="text-base font-extrabold text-navy-900">
          Open Positions ({listings.length})
        </Text>
        {(searchQuery || locationQuery || employmentType || workMode) && (
          <Pressable
            onPress={() => {
              setSearchQuery("");
              setLocationQuery("");
              setEmploymentType("");
              setWorkMode("");
            }}
          >
            <Text className="text-xs font-bold text-brand">Reset filters</Text>
          </Pressable>
        )}
      </View>

      {/* Listings List */}
      {listingsQuery.isLoading ? (
        <View className="gap-3">
          {[1, 2, 3, 4].map((idx) => (
            <View key={idx} className="h-32 rounded-2xl bg-surface-sunken" />
          ))}
        </View>
      ) : listingsQuery.isError ? (
        <ErrorState
          title="Could not load jobs"
          message="Check your connection and try again."
          onAction={() => void listingsQuery.refetch()}
        />
      ) : listings.length === 0 ? (
        <EmptyState
          title="No job openings found"
          description="Try broadening your keywords or clearing the employment filters."
        />
      ) : (
        <View className="gap-3">
          {listings.map((item) => (
            <JobCard key={item.id} listing={item} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}
