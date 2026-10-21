import { useQuery } from "@tanstack/react-query";
import {
  EmptyState,
  ErrorState,
  ListingCardSkeleton,
  Text,
} from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import {
  Check,
  ChevronDown,
  FileCheck2,
  Filter,
  MapPin,
  Search,
  X,
} from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  TextInput,
  View,
} from "react-native";

import { fetchListingFilters, fetchListings, type Listing } from "../queries";
import { THEME_COLORS } from "../theme-colors";
import { JobCard } from "./job-card";

export interface CategoryOption {
  label: string;
  value: string;
}

export const DEFAULT_JOB_CATEGORIES: CategoryOption[] = [
  { label: "All Roles", value: "" },
  { label: "BPO & Call Center Jobs", value: "bpo-call-center" },
  { label: "Banking & Insurance Jobs", value: "banking-insurance" },
  { label: "Beauty & Wellness Jobs", value: "beauty-wellness" },
  { label: "Business Services Jobs", value: "business-services" },
  { label: "Cleaning & Maintenance Jobs", value: "cleaning-maintenance" },
  { label: "Construction Jobs", value: "construction" },
  { label: "Customer Support Jobs", value: "customer-support" },
  { label: "Delivery & Logistics Jobs", value: "delivery-logistics" },
  { label: "Domestic Jobs", value: "domestic" },
  { label: "Driver Jobs", value: "driver" },
  { label: "Education Jobs", value: "education" },
  { label: "Finance & Accounts Jobs", value: "finance-accounts" },
  { label: "Freelance Jobs", value: "freelance" },
  { label: "HR & Recruitment Jobs", value: "hr-recruitment" },
  { label: "Health Care Jobs", value: "health-care" },
  { label: "Hotels & Restaurant Jobs", value: "hotels-restaurant" },
  { label: "IT & Software Jobs", value: "it-software" },
  { label: "Internship Jobs", value: "internship" },
  { label: "Legal Jobs", value: "legal" },
  { label: "Office & Admin Jobs", value: "office-admin" },
  { label: "Real Estate Jobs", value: "real-estate" },
  { label: "Retail & Shop Staff", value: "retail-shop-staff" },
  { label: "Sales & Marketing Jobs", value: "sales-marketing" },
  { label: "Security Jobs", value: "security" },
  { label: "Technician Jobs", value: "technician" },
  { label: "Vehicle & Transport Jobs", value: "vehicle-transport" },
  { label: "Work From Home Jobs", value: "work-from-home" },
];

const SORT_OPTIONS = [
  { label: "Latest", value: "latest" },
  { label: "Salary: High to Low", value: "salary_high" },
  { label: "Salary: Low to High", value: "salary_low" },
];

export function ListingsBrowseScreen() {
  const router = useRouter();

  // Search input draft states
  const [draftQuery, setDraftQuery] = useState("");
  const [draftLocation, setDraftLocation] = useState("");

  // Applied query filters
  const [appliedQuery, setAppliedQuery] = useState("");
  const [appliedLocation, setAppliedLocation] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [employmentType, setEmploymentType] = useState<string>("");
  const [workMode, setWorkMode] = useState<string>("");
  const [minSalary, setMinSalary] = useState<number | undefined>(undefined);
  const [sort, setSort] = useState("latest");

  // Role search in category box
  const [roleSearch, setRoleSearch] = useState("");
  const [sortModalOpen, setSortModalOpen] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);

  const commitSearch = useCallback(() => {
    setAppliedQuery(draftQuery);
    setAppliedLocation(draftLocation);
  }, [draftQuery, draftLocation]);

  const clearAllFilters = useCallback(() => {
    setDraftQuery("");
    setDraftLocation("");
    setAppliedQuery("");
    setAppliedLocation("");
    setSelectedCategory("");
    setEmploymentType("");
    setWorkMode("");
    setMinSalary(undefined);
    setSort("latest");
    setRoleSearch("");
  }, []);

  const filtersQuery = useQuery({
    queryKey: ["listing-filters"],
    queryFn: fetchListingFilters,
    staleTime: 60_000,
  });

  const allCategories: CategoryOption[] = useMemo(() => {
    if (filtersQuery.data?.categories?.length) {
      const rawCategories: CategoryOption[] = filtersQuery.data.categories.map(
        (c: { label?: string; value: string }) => ({
          label: c.label || c.value,
          value: c.value,
        }),
      );
      const withoutAll = rawCategories.filter(
        (c) => c.value !== "" && c.label.toLowerCase() !== "all roles",
      );
      return [{ label: "All Roles", value: "" }, ...withoutAll];
    }
    return DEFAULT_JOB_CATEGORIES;
  }, [filtersQuery.data?.categories]);

  const filteredCategories = useMemo(() => {
    if (!roleSearch.trim()) return allCategories;
    const q = roleSearch.toLowerCase().trim();
    return allCategories.filter(
      (cat) =>
        cat.value === "" ||
        cat.label.toLowerCase().includes(q) ||
        cat.value.toLowerCase().includes(q),
    );
  }, [allCategories, roleSearch]);

  const selectedCategoryLabel = useMemo(() => {
    if (!selectedCategory) return null;
    return allCategories.find((c) => c.value === selectedCategory)?.label ?? selectedCategory;
  }, [allCategories, selectedCategory]);

  const listingsQuery = useQuery({
    queryKey: [
      "listings",
      appliedQuery,
      appliedLocation,
      selectedCategory,
      employmentType,
      workMode,
      minSalary,
      sort,
    ],
    queryFn: () =>
      fetchListings({
        q: appliedQuery || undefined,
        location: appliedLocation || undefined,
        service: selectedCategory || undefined,
        employment_type: employmentType || undefined,
        work_mode: workMode || undefined,
        min_salary: minSalary,
        sort,
      }),
    staleTime: 30_000,
  });

  const listings = (listingsQuery.data as Listing[]) ?? [];
  const currentSortLabel =
    SORT_OPTIONS.find((s) => s.value === sort)?.label ?? "Latest";

  return (
    <ScrollView
      className="flex-1 bg-canvas"
      contentContainerClassName="gap-4 px-4 py-4 pb-20"
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={listingsQuery.isRefetching}
          onRefresh={() => void listingsQuery.refetch()}
        />
      }
    >
      {/* 1. Hero Card (White card matching customer portal screenshot) */}
      <View className="rounded-3xl border border-line bg-surface p-5 shadow-xs gap-3.5">
        <View className="gap-1.5">
          <Text className="text-2xl font-black text-navy-900 tracking-tight leading-tight">
            Find Your Next{"\n"}Opportunity
          </Text>
          <Text className="text-xs text-text-secondary leading-relaxed">
            Jobs from trusted employers. Build your career with V Solve Hub.
          </Text>
        </View>

        {/* My Applications button */}
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/listings/my-applications" as never)}
          className="flex-row items-center justify-center gap-2 rounded-xl border border-line bg-surface py-2.5 active:bg-surface-sunken"
        >
          <FileCheck2 size={15} color={THEME_COLORS.navy900} />
          <Text className="text-xs font-bold text-navy-900">My Applications</Text>
        </Pressable>

        {/* Search jobs input */}
        <View className="flex-row items-center rounded-xl bg-surface-sunken px-3.5 py-2.5 border border-line/40">
          <Search size={15} color={THEME_COLORS.muted} />
          <TextInput
            placeholder="Search jobs (e.g. accountant, dev..."
            placeholderTextColor="rgba(117,108,94,0.6)"
            value={draftQuery}
            onChangeText={setDraftQuery}
            onSubmitEditing={commitSearch}
            returnKeyType="search"
            className="ml-2.5 flex-1 text-xs text-navy-900 p-0"
          />
          {draftQuery ? (
            <Pressable
              onPress={() => {
                setDraftQuery("");
                setAppliedQuery("");
              }}
            >
              <X size={14} color={THEME_COLORS.muted} />
            </Pressable>
          ) : null}
        </View>

        {/* Location input */}
        <View className="flex-row items-center rounded-xl bg-surface-sunken px-3.5 py-2.5 border border-line/40">
          <MapPin size={15} color={THEME_COLORS.muted} />
          <TextInput
            placeholder="Hyderabad"
            placeholderTextColor="rgba(117,108,94,0.6)"
            value={draftLocation}
            onChangeText={setDraftLocation}
            onSubmitEditing={commitSearch}
            returnKeyType="search"
            className="ml-2.5 flex-1 text-xs text-navy-900 p-0"
          />
          {draftLocation ? (
            <Pressable
              onPress={() => {
                setDraftLocation("");
                setAppliedLocation("");
              }}
            >
              <X size={14} color={THEME_COLORS.muted} />
            </Pressable>
          ) : null}
        </View>

        {/* Search Jobs action button */}
        <Pressable
          accessibilityRole="button"
          onPress={commitSearch}
          className="items-center justify-center rounded-xl bg-action py-3 active:bg-action-dark"
        >
          <Text className="text-xs font-bold text-white">
            {listingsQuery.isFetching ? "Searching..." : "Search Jobs"}
          </Text>
        </Pressable>
      </View>

      {/* 2. Quick Filter Pills (Two rows exactly as in screenshot) */}
      <View className="gap-2 pt-1">
        {/* Row 1: All jobs, Full-time, On-site */}
        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={() => {
              setEmploymentType("");
              setWorkMode("");
              setMinSalary(undefined);
            }}
            className={`rounded-full px-4 py-1.5 border ${
              !employmentType && !workMode && minSalary === undefined
                ? "border-action bg-action"
                : "border-line bg-surface"
            }`}
          >
            <Text
              className={`text-xs font-semibold ${
                !employmentType && !workMode && minSalary === undefined
                  ? "text-white"
                  : "text-text-secondary"
              }`}
            >
              All jobs
            </Text>
          </Pressable>

          <Pressable
            onPress={() =>
              setEmploymentType((v) => (v === "Full-Time" ? "" : "Full-Time"))
            }
            className={`rounded-full px-4 py-1.5 border ${
              employmentType === "Full-Time"
                ? "border-action bg-action"
                : "border-line bg-surface"
            }`}
          >
            <Text
              className={`text-xs font-semibold ${
                employmentType === "Full-Time" ? "text-white" : "text-text-secondary"
              }`}
            >
              Full-time
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setWorkMode((v) => (v === "On-site" ? "" : "On-site"))}
            className={`rounded-full px-4 py-1.5 border ${
              workMode === "On-site"
                ? "border-action bg-action"
                : "border-line bg-surface"
            }`}
          >
            <Text
              className={`text-xs font-semibold ${
                workMode === "On-site" ? "text-white" : "text-text-secondary"
              }`}
            >
              On-site
            </Text>
          </Pressable>
        </View>

        {/* Row 2: Salary tiers */}
        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={() =>
              setMinSalary((v) => (v === 2000000 ? undefined : 2000000))
            }
            className={`rounded-full px-4 py-1.5 border ${
              minSalary === 2000000
                ? "border-action bg-action"
                : "border-line bg-surface"
            }`}
          >
            <Text
              className={`text-xs font-semibold ${
                minSalary === 2000000 ? "text-white" : "text-text-secondary"
              }`}
            >
              ₹20k+ / mo
            </Text>
          </Pressable>

          <Pressable
            onPress={() =>
              setMinSalary((v) => (v === 4000000 ? undefined : 4000000))
            }
            className={`rounded-full px-4 py-1.5 border ${
              minSalary === 4000000
                ? "border-action bg-action"
                : "border-line bg-surface"
            }`}
          >
            <Text
              className={`text-xs font-semibold ${
                minSalary === 4000000 ? "text-white" : "text-text-secondary"
              }`}
            >
              ₹40k+ / mo
            </Text>
          </Pressable>

          <Pressable
            onPress={() =>
              setMinSalary((v) => (v === 6000000 ? undefined : 6000000))
            }
            className={`rounded-full px-4 py-1.5 border ${
              minSalary === 6000000
                ? "border-action bg-action"
                : "border-line bg-surface"
            }`}
          >
            <Text
              className={`text-xs font-semibold ${
                minSalary === 6000000 ? "text-white" : "text-text-secondary"
              }`}
            >
              ₹60k+ / mo
            </Text>
          </Pressable>
        </View>
      </View>

      {/* 3. Role & Category Dropdown Button */}
      <View className="flex-row items-center gap-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Filter by role and category"
          onPress={() => setCategoryModalOpen(true)}
          className={`flex-1 flex-row items-center justify-between rounded-2xl border px-4 py-3 shadow-2xs ${
            selectedCategory
              ? "border-navy-900 bg-navy-900"
              : "border-line bg-surface active:bg-surface-sunken"
          }`}
        >
          <View className="flex-row items-center gap-2.5 flex-1 mr-2 min-w-0">
            <View
              className={`size-7 items-center justify-center rounded-lg ${
                selectedCategory ? "bg-white/15" : "bg-surface-sunken"
              }`}
            >
              <Filter size={14} color={selectedCategory ? "#FFFFFF" : THEME_COLORS.muted} />
            </View>
            <View className="flex-1 min-w-0">
              <Text
                className={`text-[10px] font-bold uppercase tracking-wider ${
                  selectedCategory ? "text-white/70" : "text-text-muted"
                }`}
              >
                ROLE & CATEGORY
              </Text>
              <Text
                numberOfLines={1}
                className={`text-xs font-bold mt-0.5 ${
                  selectedCategory ? "text-white" : "text-navy-900"
                }`}
              >
                {selectedCategoryLabel || "All Roles"}
              </Text>
            </View>
          </View>
          <View className="flex-row items-center gap-1.5">
            {selectedCategory ? (
              <Pressable
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Clear role filter"
                onPress={(e) => {
                  e.stopPropagation?.();
                  setSelectedCategory("");
                }}
                className="size-6 items-center justify-center rounded-full bg-white/20 mr-1"
              >
                <X size={12} color="#FFFFFF" />
              </Pressable>
            ) : null}
            <ChevronDown size={15} color={selectedCategory ? "#FFFFFF" : THEME_COLORS.navy900} />
          </View>
        </Pressable>
      </View>

      {/* 4. Results Header & Sort Dropdown */}
      <View className="flex-row items-center justify-between pt-1">
        <Text className="text-sm font-bold text-navy-900">
          Showing {listings.length} jobs
          {appliedLocation ? ` in ${appliedLocation}` : " in Hyderabad"}
        </Text>

        <View className="flex-row items-center gap-1.5">
          <Text className="text-xs text-text-secondary">Sort by:</Text>
          <Pressable
            onPress={() => setSortModalOpen(true)}
            className="flex-row items-center gap-1 rounded-md border border-line bg-surface px-2.5 py-1 active:bg-surface-sunken"
          >
            <Text className="text-xs font-semibold text-navy-900">
              {currentSortLabel}
            </Text>
            <ChevronDown size={12} color={THEME_COLORS.navy900} />
          </Pressable>
        </View>
      </View>

      {/* 5. Job Listings / Skeletons / Empty State */}
      {listingsQuery.isLoading ? (
        <View className="gap-3">
          <ListingCardSkeleton />
          <ListingCardSkeleton />
          <ListingCardSkeleton />
        </View>
      ) : listingsQuery.isError ? (
        <ErrorState
          title="Could not load job listings"
          message="Check your network connection and try again."
          onAction={() => void listingsQuery.refetch()}
        />
      ) : listings.length === 0 ? (
        <EmptyState
          title="No career listings found"
          description="We couldn't find any active job listings matching your search criteria. Try modifying your keywords or filters."
          action={
            <Pressable
              onPress={clearAllFilters}
              className="mt-3 rounded-xl bg-action px-5 py-2.5 active:bg-action-dark"
            >
              <Text className="text-xs font-bold text-white">Reset Filters</Text>
            </Pressable>
          }
        />
      ) : (
        <View className="gap-3">
          {listings.map((item) => (
            <JobCard key={item.id} listing={item} />
          ))}
        </View>
      )}

      {/* Role & Category Dropdown Selection Modal */}
      <Modal
        visible={categoryModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCategoryModalOpen(false)}
      >
        <Pressable
          onPress={() => setCategoryModalOpen(false)}
          className="flex-1 items-center justify-center bg-black/50 px-5"
        >
          <Pressable
            onPress={(e) => e.stopPropagation?.()}
            className="w-full max-w-sm max-h-[80%] rounded-3xl border border-line bg-surface p-5 shadow-raised"
          >
            {/* Modal Header */}
            <View className="flex-row items-center justify-between pb-3 border-b border-line">
              <View className="flex-1 mr-2">
                <Text className="text-base font-extrabold text-navy-900">Role & Category</Text>
                <Text className="text-xs text-text-muted mt-0.5">Filter listings by department or field</Text>
              </View>
              <Pressable
                onPress={() => setCategoryModalOpen(false)}
                hitSlop={8}
                className="size-7 items-center justify-center rounded-full bg-surface-sunken"
              >
                <X size={14} color={THEME_COLORS.muted} />
              </Pressable>
            </View>

            {/* Live Search Input */}
            <View className="mt-3.5 mb-2.5 flex-row items-center rounded-xl bg-surface-sunken px-3 py-2 border border-line/60">
              <Search size={14} color={THEME_COLORS.muted} />
              <TextInput
                placeholder="Search roles..."
                placeholderTextColor="rgba(117,108,94,0.6)"
                value={roleSearch}
                onChangeText={setRoleSearch}
                className="ml-2 flex-1 text-xs text-navy-900 p-0"
              />
              {roleSearch ? (
                <Pressable onPress={() => setRoleSearch("")} hitSlop={8}>
                  <X size={13} color={THEME_COLORS.muted} />
                </Pressable>
              ) : null}
            </View>

            {/* Roles List */}
            <ScrollView
              className="mt-1"
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View className="gap-1.5 pb-2">
                {filteredCategories.map((cat) => {
                  const isSelected = selectedCategory === cat.value;
                  return (
                    <Pressable
                      key={cat.label}
                      onPress={() => {
                        setSelectedCategory(cat.value);
                        setCategoryModalOpen(false);
                      }}
                      className={`flex-row items-center justify-between rounded-xl px-3.5 py-3 border ${
                        isSelected
                          ? "border-navy-900 bg-navy-900"
                          : "border-line/40 bg-white active:bg-surface-sunken"
                      }`}
                    >
                      <Text
                        className={`text-xs ${
                          isSelected ? "font-bold text-white" : "font-semibold text-navy-900"
                        }`}
                      >
                        {cat.label}
                      </Text>
                      {isSelected ? (
                        <View className="size-2 rounded-full bg-action" />
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Sort Options Modal */}
      <Modal
        visible={sortModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSortModalOpen(false)}
      >
        <Pressable
          onPress={() => setSortModalOpen(false)}
          className="flex-1 items-center justify-center bg-black/40 px-6"
        >
          <View className="w-full max-w-xs rounded-2xl border border-line bg-surface p-4 shadow-raised gap-2">
            <Text className="text-sm font-bold text-navy-900 mb-1">Sort By</Text>
            {SORT_OPTIONS.map((option) => (
              <Pressable
                key={option.value}
                onPress={() => {
                  setSort(option.value);
                  setSortModalOpen(false);
                }}
                className={`rounded-xl px-3.5 py-2.5 flex-row items-center justify-between ${
                  sort === option.value ? "bg-navy-900" : "bg-surface-sunken"
                }`}
              >
                <Text
                  className={`text-xs font-bold ${
                    sort === option.value ? "text-white" : "text-navy-900"
                  }`}
                >
                  {option.label}
                </Text>
                {sort === option.value ? (
                  <View className="size-2 rounded-full bg-action" />
                ) : null}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}
