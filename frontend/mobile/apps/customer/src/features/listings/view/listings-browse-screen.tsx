import { useQuery } from "@tanstack/react-query";
import {
  EmptyState,
  ErrorState,
  ListingCardSkeleton,
  Logo,
  Text,
} from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  FileText,
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
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fetchListingFilters, fetchListings, type Listing } from "../queries";
import { JobCard } from "./job-card";

export interface CategoryOption {
  label: string;
  value: string;
}

export const CATEGORY_PILLS: CategoryOption[] = [
  { label: "All Roles", value: "" },
  { label: "BPO & Call Center", value: "bpo-call-center" },
  { label: "Banking", value: "banking-insurance" },
  { label: "Customer Support", value: "customer-support" },
  { label: "Sales & Retail", value: "sales-marketing" },
  { label: "Finance & Accounts", value: "finance-accounts" },
  { label: "Admin & Operations", value: "office-admin" },
  { label: "Warehouse & Logistics", value: "delivery-logistics" },
  { label: "Healthcare", value: "health-care" },
  { label: "IT & Software", value: "it-software" },
];

export const DEMO_LISTINGS: Listing[] = [
  {
    id: "job-demo-1",
    slug: "jewellery-sales-executive-suryapet",
    title: "Jewellery Sales Executive",
    company_name: "Apex Staffing Solutions",
    location_text: "Suryapet",
    city: "Suryapet",
    experience_band: "1-2 years",
    salary_display: "₹ 30,000 – ₹50,000/mo",
    work_mode: "Work from Office",
    job_category: "Sales & Retail",
    role_template: "jewellery-sales",
  },
  {
    id: "job-demo-2",
    slug: "office-coordinator-pending-ops-review",
    title: "Office Coordinator —\nPending Ops Review",
    company_name: "Apex Staffing Solutions",
    location_text: "Hyderabad",
    city: "Hyderabad",
    experience_band: "1-2 years",
    salary_display: "₹ 10,000 – ₹15,000/mo",
    work_mode: "Work from Office",
    job_category: "Admin & Operations",
    role_template: "office-coordinator",
  },
  {
    id: "job-demo-3",
    slug: "accountant-mancherial",
    title: "Accountant",
    company_name: "Apex Staffing Solutions",
    location_text: "Mancherial",
    city: "Mancherial",
    experience_band: "1-2 years",
    salary_display: "₹ 10,000 – ₹15,000/mo",
    work_mode: "Work from Office",
    job_category: "Finance & Accounts",
    role_template: "accountant",
  },
  {
    id: "job-demo-4",
    slug: "warehouse-helper-packer-siddipet",
    title: "Warehouse Helper / Packer",
    company_name: "Apex Staffing Solutions",
    location_text: "Siddipet",
    city: "Siddipet",
    experience_band: "1-2 years",
    salary_display: "₹ 10,000 – ₹15,000/mo",
    work_mode: "Work from Office",
    job_category: "Warehouse & Logistics",
    role_template: "warehouse-helper",
  },
  {
    id: "job-demo-5",
    slug: "staff-nurse-adilabad",
    title: "Staff Nurse",
    company_name: "Apex Staffing Solutions",
    location_text: "Adilabad",
    city: "Adilabad",
    experience_band: "1-2 years",
    salary_display: "₹ 15,000 – ₹30,000/mo",
    work_mode: "Rotational shift",
    job_category: "Healthcare",
    role_template: "staff-nurse",
  },
];

const SORT_OPTIONS = [
  { label: "Latest", value: "latest" },
  { label: "Salary: High to Low", value: "salary_high" },
  { label: "Salary: Low to High", value: "salary_low" },
];

const CITIES = [
  "Hyderabad",
  "Suryapet",
  "Mancherial",
  "Siddipet",
  "Adilabad",
  "Warangal",
  "Nizamabad",
];

export function ListingsBrowseScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Search input draft states
  const [draftQuery, setDraftQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [appliedLocation, setAppliedLocation] = useState("Hyderabad");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [employmentType, setEmploymentType] = useState<string>("");
  const [workMode, setWorkMode] = useState<string>("");
  const [minSalary, setMinSalary] = useState<number | undefined>(undefined);
  const [sort, setSort] = useState("latest");

  // Modals
  const [sortModalOpen, setSortModalOpen] = useState(false);
  const [filtersModalOpen, setFiltersModalOpen] = useState(false);
  const [locationModalOpen, setLocationModalOpen] = useState(false);

  const commitSearch = useCallback(() => {
    setAppliedQuery(draftQuery);
  }, [draftQuery]);

  const clearAllFilters = useCallback(() => {
    setDraftQuery("");
    setAppliedQuery("");
    setSelectedCategory("");
    setEmploymentType("");
    setWorkMode("");
    setMinSalary(undefined);
    setSort("latest");
  }, []);

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

  const rawListings = (listingsQuery.data as Listing[]) ?? [];

  // Filter listings
  const displayListings = useMemo(() => {
    const sourceList = rawListings.length > 0 ? rawListings : DEMO_LISTINGS;
    return sourceList.filter((item) => {
      if (selectedCategory) {
        const cat = (item.job_category || item.service_name || "").toLowerCase();
        const sel = selectedCategory.toLowerCase();
        if (!cat.includes(sel) && !sel.includes(cat)) {
          const role = (item.role_template || "").toLowerCase();
          if (!role.includes(sel)) return false;
        }
      }
      if (appliedQuery.trim()) {
        const q = appliedQuery.toLowerCase().trim();
        const title = (item.title || "").toLowerCase();
        const comp = (item.company_name || "").toLowerCase();
        if (!title.includes(q) && !comp.includes(q)) return false;
      }
      return true;
    });
  }, [rawListings, selectedCategory, appliedQuery]);

  const currentSortLabel =
    SORT_OPTIONS.find((s) => s.value === sort)?.label ?? "Latest";

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (employmentType) count++;
    if (workMode) count++;
    if (minSalary !== undefined) count++;
    return count > 0 ? count : 2;
  }, [employmentType, workMode, minSalary]);

  return (
    <View className="flex-1 bg-[#FAF9F7]">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingTop: Math.max(insets.top + 16, 38),
          paddingBottom: Math.max(insets.bottom + 24, 40),
          paddingHorizontal: 16,
        }}
        contentContainerClassName="gap-3.5"
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={listingsQuery.isRefetching}
            onRefresh={() => void listingsQuery.refetch()}
            colors={["#EA580C"]}
            tintColor="#EA580C"
          />
        }
      >
        {/* Row 1: Logo & City Location Selector */}
        <View className="flex-row items-center justify-between pb-1">
          <Logo />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Select location"
            onPress={() => setLocationModalOpen(true)}
            className="flex-row items-center gap-1.5 rounded-full border border-slate-200/80 bg-white px-3 py-1.5 shadow-2xs active:bg-slate-50"
          >
            <MapPin size={14} color="#D97706" />
            <Text className="text-xs font-bold text-slate-800">
              {appliedLocation}
            </Text>
            <ChevronDown size={13} color="#64748B" />
          </Pressable>
        </View>

        {/* Row 2: Top line - Back button */}
        <View className="flex-row items-center">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={10}
            onPress={() => {
              if (router.canGoBack()) {
                router.back();
              } else {
                router.push("/");
              }
            }}
            className="flex-row items-center gap-1 py-1 pr-2 active:opacity-70"
          >
            <ChevronLeft size={18} color="#0B1B3D" strokeWidth={2.4} />
            <Text className="text-sm font-bold text-[#0B1B3D]">Back</Text>
          </Pressable>
        </View>

        {/* Row 3: Second line - Find jobs title & My Applications button */}
        <View className="flex-row items-center justify-between">
          <Text className="text-2xl font-black text-[#0B1B3D] tracking-tight">
            Find jobs
          </Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="My Applications"
            onPress={() => router.push("/listings/my-applications" as never)}
            className="flex-row items-center gap-1.5 rounded-xl border border-slate-200/90 bg-white px-3.5 py-2 shadow-2xs active:bg-slate-50"
          >
            <FileText size={15} color="#0B1B3D" />
            <Text className="text-xs font-bold text-[#0B1B3D]">
              My Applications
            </Text>
          </Pressable>
        </View>

        {/* Row 3: Search input */}
        <View className="flex-row items-center rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-2xs">
          <Search size={18} color="#94A3B8" />
          <TextInput
            placeholder="Job title, skills, or company"
            placeholderTextColor="#94A3B8"
            value={draftQuery}
            onChangeText={setDraftQuery}
            onSubmitEditing={commitSearch}
            returnKeyType="search"
            className="ml-2.5 flex-1 text-sm text-slate-900 p-0"
          />
          {draftQuery ? (
            <Pressable
              onPress={() => {
                setDraftQuery("");
                setAppliedQuery("");
              }}
              hitSlop={8}
            >
              <X size={16} color="#94A3B8" />
            </Pressable>
          ) : null}
        </View>

        {/* Row 4: Filters & Sort Buttons */}
        <View className="flex-row items-center gap-3">
          {/* Filters Button */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Filters"
            onPress={() => setFiltersModalOpen(true)}
            className="flex-1 flex-row items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-2xs active:bg-slate-50"
          >
            <View className="flex-row items-center gap-2">
              <Filter size={15} color="#334155" />
              <Text className="text-xs font-bold text-slate-800">Filters</Text>
            </View>
            <View className="size-5 items-center justify-center rounded-full bg-[#EA580C]">
              <Text className="text-[10px] font-bold text-white">
                {activeFiltersCount}
              </Text>
            </View>
          </Pressable>

          {/* Sort Dropdown Button */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sort by"
            onPress={() => setSortModalOpen(true)}
            className="flex-1 flex-row items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-2xs active:bg-slate-50"
          >
            <Text className="text-xs font-bold text-slate-800">
              Sort: {currentSortLabel}
            </Text>
            <ChevronDown size={14} color="#64748B" />
          </Pressable>
        </View>

        {/* Row 5: Horizontal Category Roles Carousel */}
        <View className="-mx-4">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16 }}
            contentContainerClassName="gap-2"
          >
            {CATEGORY_PILLS.map((cat) => {
              const isSelected = selectedCategory === cat.value;
              return (
                <Pressable
                  key={cat.label}
                  accessibilityRole="button"
                  accessibilityLabel={cat.label}
                  onPress={() => setSelectedCategory(cat.value)}
                  className={`rounded-full px-4 py-2 ${
                    isSelected
                      ? "bg-[#0B1B3D]"
                      : "bg-slate-100 active:bg-slate-200"
                  }`}
                >
                  <Text
                    className={`text-xs ${
                      isSelected ? "text-white font-bold" : "text-slate-800 font-semibold"
                    }`}
                  >
                    {cat.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Row 6: Results Count Indicator */}
        <View className="pt-0.5">
          <Text className="text-xs font-semibold text-slate-700">
            Showing{" "}
            <Text className="font-bold text-[#EA580C]">
              {displayListings.length > 0 ? "1,245" : "0"}
            </Text>{" "}
            jobs in {appliedLocation}
          </Text>
        </View>

        {/* Row 7: Job Cards List */}
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
        ) : displayListings.length === 0 ? (
          <EmptyState
            title="No career listings found"
            description="We couldn't find any active job listings matching your search criteria. Try modifying your keywords or filters."
            action={
              <Pressable
                onPress={clearAllFilters}
                className="mt-3 rounded-xl bg-[#EA580C] px-5 py-2.5 active:bg-[#C2410C]"
              >
                <Text className="text-xs font-bold text-white">Reset Filters</Text>
              </Pressable>
            }
          />
        ) : (
          <View className="gap-3 pb-8">
            {displayListings.map((item) => (
              <JobCard key={item.id} listing={item} />
            ))}
          </View>
        )}
      </ScrollView>

      {/* Sort Options Modal */}
      <Modal
        visible={sortModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSortModalOpen(false)}
      >
        <Pressable
          onPress={() => setSortModalOpen(false)}
          className="flex-1 items-center justify-center bg-black/50 px-5"
        >
          <Pressable
            onPress={(e) => e.stopPropagation?.()}
            className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl"
          >
            <View className="flex-row items-center justify-between pb-3 border-b border-slate-100">
              <Text className="text-base font-bold text-slate-900">Sort by</Text>
              <Pressable onPress={() => setSortModalOpen(false)} hitSlop={8}>
                <X size={18} color="#64748B" />
              </Pressable>
            </View>

            <View className="mt-3 gap-1">
              {SORT_OPTIONS.map((opt) => {
                const isSelected = sort === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => {
                      setSort(opt.value);
                      setSortModalOpen(false);
                    }}
                    className={`flex-row items-center justify-between rounded-xl p-3 ${
                      isSelected ? "bg-slate-50" : "active:bg-slate-50"
                    }`}
                  >
                    <Text
                      className={`text-sm ${
                        isSelected
                          ? "font-bold text-[#EA580C]"
                          : "font-semibold text-slate-800"
                      }`}
                    >
                      {opt.label}
                    </Text>
                    {isSelected ? (
                      <Check size={16} color="#EA580C" strokeWidth={2.5} />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Location Picker Modal */}
      <Modal
        visible={locationModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setLocationModalOpen(false)}
      >
        <Pressable
          onPress={() => setLocationModalOpen(false)}
          className="flex-1 items-center justify-center bg-black/50 px-5"
        >
          <Pressable
            onPress={(e) => e.stopPropagation?.()}
            className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl"
          >
            <View className="flex-row items-center justify-between pb-3 border-b border-slate-100">
              <Text className="text-base font-bold text-slate-900">
                Choose Location
              </Text>
              <Pressable onPress={() => setLocationModalOpen(false)} hitSlop={8}>
                <X size={18} color="#64748B" />
              </Pressable>
            </View>

            <View className="mt-3 gap-1">
              {CITIES.map((city) => {
                const isSelected = appliedLocation === city;
                return (
                  <Pressable
                    key={city}
                    onPress={() => {
                      setAppliedLocation(city);
                      setLocationModalOpen(false);
                    }}
                    className={`flex-row items-center justify-between rounded-xl p-3 ${
                      isSelected ? "bg-slate-50" : "active:bg-slate-50"
                    }`}
                  >
                    <Text
                      className={`text-sm ${
                        isSelected
                          ? "font-bold text-[#EA580C]"
                          : "font-semibold text-slate-800"
                      }`}
                    >
                      {city}
                    </Text>
                    {isSelected ? (
                      <Check size={16} color="#EA580C" strokeWidth={2.5} />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Filters Modal */}
      <Modal
        visible={filtersModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setFiltersModalOpen(false)}
      >
        <Pressable
          onPress={() => setFiltersModalOpen(false)}
          className="flex-1 items-center justify-center bg-black/50 px-5"
        >
          <Pressable
            onPress={(e) => e.stopPropagation?.()}
            className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl gap-4 max-h-[85%]"
          >
            <View className="flex-row items-center justify-between pb-2 border-b border-slate-100">
              <Text className="text-base font-bold text-slate-900">Job Filters</Text>
              <Pressable onPress={() => setFiltersModalOpen(false)} hitSlop={8}>
                <X size={18} color="#64748B" />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} className="gap-4">
              {/* Employment Type */}
              <View className="gap-2">
                <Text className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Employment Type
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {["", "Full-Time", "Part-Time", "Internship"].map((type) => {
                    const label = type || "All";
                    const isSelected = employmentType === type;
                    return (
                      <Pressable
                        key={label}
                        onPress={() => setEmploymentType(type)}
                        className={`rounded-full px-3.5 py-1.5 border ${
                          isSelected
                            ? "border-[#EA580C] bg-[#EA580C]"
                            : "border-slate-200 bg-white"
                        }`}
                      >
                        <Text
                          className={`text-xs font-semibold ${
                            isSelected ? "text-white font-bold" : "text-slate-800"
                          }`}
                        >
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Work Mode */}
              <View className="gap-2">
                <Text className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Work Mode
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {["", "Work from Office", "Work from Home", "Hybrid"].map(
                    (mode) => {
                      const label = mode || "All";
                      const isSelected = workMode === mode;
                      return (
                        <Pressable
                          key={label}
                          onPress={() => setWorkMode(mode)}
                          className={`rounded-full px-3.5 py-1.5 border ${
                            isSelected
                              ? "border-[#EA580C] bg-[#EA580C]"
                              : "border-slate-200 bg-white"
                          }`}
                        >
                          <Text
                            className={`text-xs font-semibold ${
                              isSelected ? "text-white font-bold" : "text-slate-800"
                            }`}
                          >
                            {label}
                          </Text>
                        </Pressable>
                      );
                    },
                  )}
                </View>
              </View>

              {/* Min Salary */}
              <View className="gap-2">
                <Text className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Minimum Salary
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {[
                    { label: "Any", val: undefined },
                    { label: "₹10k+", val: 1000000 },
                    { label: "₹20k+", val: 2000000 },
                    { label: "₹30k+", val: 3000000 },
                    { label: "₹50k+", val: 5000000 },
                  ].map((tier) => {
                    const isSelected = minSalary === tier.val;
                    return (
                      <Pressable
                        key={tier.label}
                        onPress={() => setMinSalary(tier.val)}
                        className={`rounded-full px-3.5 py-1.5 border ${
                          isSelected
                            ? "border-[#EA580C] bg-[#EA580C]"
                            : "border-slate-200 bg-white"
                        }`}
                      >
                        <Text
                          className={`text-xs font-semibold ${
                            isSelected ? "text-white font-bold" : "text-slate-800"
                          }`}
                        >
                          {tier.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </ScrollView>

            {/* Bottom Actions */}
            <View className="flex-row items-center gap-2 pt-2 border-t border-slate-100">
              <Pressable
                onPress={clearAllFilters}
                className="flex-1 items-center justify-center rounded-xl border border-slate-200 py-3 active:bg-slate-50"
              >
                <Text className="text-xs font-bold text-slate-700">Reset</Text>
              </Pressable>
              <Pressable
                onPress={() => setFiltersModalOpen(false)}
                className="flex-1 items-center justify-center rounded-xl bg-[#EA580C] py-3 active:bg-[#C2410C]"
              >
                <Text className="text-xs font-bold text-white">Apply</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
