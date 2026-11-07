import { Badge, Button, EmptyState, ErrorState, Spinner, Text, cn } from "@vsolve/mobile-ui";
import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Plus } from "lucide-react-native";

import {
  type PartnerStayVisit,
  type StayEnquiry,
  type StayProperty,
  type StayReservation,
  type StayReservationAction,
  type StayUnit,
  type VisitDeclineReason,
  clockWindow,
  dayLabel,
} from "../model";
import {
  cancelPartnerStayEnquiry,
  confirmPartnerStayEnquiry,
  fetchPartnerStayEnquiries,
  fetchPartnerStayProperties,
  fetchPartnerStayReservations,
  fetchPartnerStaySummary,
  fetchPartnerStayVisits,
  partnerStayReservationAction,
  partnerStayRoomAction,
  partnerStayVisitAction,
  respondPartnerStayEnquiry,
} from "../queries";
import { THEME_COLORS } from "../theme-colors";
import { PropertyCard } from "./property-card";
import { EnquiryCard } from "./enquiry-card";
import { VisitCard } from "./visit-card";
import { StayReservationCard } from "./stay-reservation-card";
import { PropertySheet } from "./property-sheet";
import { UnitSheet } from "./unit-sheet";
import { VisitingHoursSheet } from "./visiting-hours-sheet";
import { StaySummaryCards } from "./stay-summary-cards";
import { StayEnquiryDetailSheet } from "./stay-enquiry-detail-sheet";
import { StayReservationDetailSheet } from "./stay-reservation-detail-sheet";

const OPEN_ENQUIRY = new Set(["SUBMITTED", "RESPONDED"]);

type EnquiryFilter = "OPEN" | "CONFIRMED" | "CLOSED" | "ALL";

const VISIT_FILTERS = [
  { value: "REQUESTED", label: "To answer" },
  { value: "ACCEPTED", label: "Accepted" },
  { value: "CLOSED", label: "Closed" },
] as const;
type VisitFilter = (typeof VISIT_FILTERS)[number]["value"];

export function PartnerStaysScreen({
  initialTab = "properties",
}: {
  initialTab?: "properties" | "enquiries" | "visits" | "bookings";
}) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"properties" | "enquiries" | "visits" | "bookings">(initialTab);

  // Property sub-filters & sheets
  const [propertyFilter, setPropertyFilter] = useState<"active" | "archived">("active");
  const [propertySheetOpen, setPropertySheetOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState<StayProperty | null>(null);

  // Unit Sheet
  const [unitSheetOpen, setUnitSheetOpen] = useState(false);
  const [unitProperty, setUnitProperty] = useState<StayProperty | null>(null);
  const [editingUnit, setEditingUnit] = useState<StayUnit | null>(null);

  // Visiting Hours Sheet
  const [visitingHoursSheetOpen, setVisitingHoursSheetOpen] = useState(false);
  const [visitingHoursProperty, setVisitingHoursProperty] = useState<StayProperty | null>(null);

  // Enquiries & Detail Sheet
  const [enquiryFilter, setEnquiryFilter] = useState<EnquiryFilter>("OPEN");
  const [selectedEnquiry, setSelectedEnquiry] = useState<StayEnquiry | null>(null);

  // Visits Filter
  const [visitFilter, setVisitFilter] = useState<VisitFilter>("REQUESTED");
  const [actionError, setActionError] = useState<string | null>(null);

  // Reservations Detail Sheet
  const [selectedReservation, setSelectedReservation] = useState<StayReservation | null>(null);

  // Queries
  const summaryQuery = useQuery({
    queryKey: ["partner-stay-summary"],
    queryFn: fetchPartnerStaySummary,
  });

  const propertiesQuery = useQuery({
    queryKey: ["partner-stay-properties"],
    queryFn: fetchPartnerStayProperties,
  });

  const enquiriesQuery = useQuery({
    queryKey: ["partner-stay-enquiries"],
    queryFn: fetchPartnerStayEnquiries,
  });

  const visitsQuery = useQuery({
    queryKey: ["partner-stay-visits"],
    queryFn: fetchPartnerStayVisits,
  });

  const reservationsQuery = useQuery({
    queryKey: ["partner-stay-reservations"],
    queryFn: fetchPartnerStayReservations,
  });

  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: ["partner-stay-properties"] });
    void queryClient.invalidateQueries({ queryKey: ["partner-stay-summary"] });
    void queryClient.invalidateQueries({ queryKey: ["partner-stay-enquiries"] });
    void queryClient.invalidateQueries({ queryKey: ["partner-stay-visits"] });
    void queryClient.invalidateQueries({ queryKey: ["partner-stay-reservations"] });
  };

  // Mutations
  const enquiryMutation = useMutation({
    mutationFn: ({
      id,
      action,
      note,
      roomId,
    }: {
      id: string;
      action: "booked" | "not_available" | "cancel";
      note?: string;
      roomId?: string | null;
    }) => {
      if (action === "booked") return confirmPartnerStayEnquiry(id, roomId);
      if (action === "not_available") return respondPartnerStayEnquiry(id, note ?? "", true);
      return cancelPartnerStayEnquiry(id);
    },
    onSuccess: () => {
      setActionError(null);
      setSelectedEnquiry(null);
      invalidateAll();
    },
    onError: (err: any) => setActionError(err?.message || "Failed to update enquiry"),
  });

  const visitMutation = useMutation({
    mutationFn: ({
      id,
      action,
      reason,
      note,
    }: {
      id: string;
      action: "accept" | "decline";
      reason?: VisitDeclineReason;
      note?: string;
    }) => partnerStayVisitAction(id, action, { reason, note }),
    onSuccess: () => {
      setActionError(null);
      invalidateAll();
    },
    onError: (err: any) => setActionError(err?.message || "Failed to update visit"),
  });

  const roomBookMutation = useMutation({
    mutationFn: ({
      roomId,
      visitId,
      guestName,
    }: {
      roomId: string;
      visitId: string;
      guestName?: string;
    }) => partnerStayRoomAction(roomId, "book", { occupant_name: guestName }),
    onSuccess: () => {
      setActionError(null);
      invalidateAll();
    },
    onError: (err: any) => setActionError(err?.message || "Failed to book room"),
  });

  const reservationMutation = useMutation({
    mutationFn: ({
      id,
      action,
      reason,
    }: {
      id: string;
      action: StayReservationAction;
      reason?: string;
    }) => partnerStayReservationAction(id, action, reason),
    onSuccess: () => {
      setActionError(null);
      setSelectedReservation(null);
      invalidateAll();
    },
    onError: (err: any) => setActionError(err?.message || "Failed to update reservation"),
  });

  const isRefreshing =
    propertiesQuery.isRefetching ||
    summaryQuery.isRefetching ||
    enquiriesQuery.isRefetching ||
    visitsQuery.isRefetching ||
    reservationsQuery.isRefetching;

  const onRefresh = () => {
    void propertiesQuery.refetch();
    void summaryQuery.refetch();
    void enquiriesQuery.refetch();
    void visitsQuery.refetch();
    void reservationsQuery.refetch();
  };

  // Filter properties (Active vs Archived)
  const properties = useMemo(() => propertiesQuery.data ?? [], [propertiesQuery.data]);
  const filteredProperties = useMemo(() => {
    if (propertyFilter === "archived") {
      return properties.filter((p) => p.listing_status === "ARCHIVED");
    }
    return properties.filter((p) => p.listing_status !== "ARCHIVED");
  }, [properties, propertyFilter]);

  // Filter enquiries
  const allEnquiries = useMemo(() => enquiriesQuery.data ?? [], [enquiriesQuery.data]);
  const filteredEnquiries = useMemo(() => {
    return allEnquiries.filter((e) => {
      const s = e.status ?? "";
      if (enquiryFilter === "ALL") return true;
      if (enquiryFilter === "OPEN") return OPEN_ENQUIRY.has(s);
      if (enquiryFilter === "CONFIRMED") return s === "CONFIRMED";
      return !OPEN_ENQUIRY.has(s) && s !== "CONFIRMED";
    });
  }, [allEnquiries, enquiryFilter]);

  const openEnquiriesCount = allEnquiries.filter((e) => OPEN_ENQUIRY.has(e.status ?? "")).length;

  // Filter & group visits by date + slot
  const allVisits = useMemo(() => visitsQuery.data ?? [], [visitsQuery.data]);
  const filteredVisits = useMemo(() => {
    return allVisits.filter((v) => {
      const s = v.status ?? "";
      if (visitFilter === "CLOSED") return s !== "REQUESTED" && s !== "ACCEPTED";
      return s === visitFilter;
    });
  }, [allVisits, visitFilter]);

  const visitGroups = useMemo(() => {
    const map = new Map<string, PartnerStayVisit[]>();
    for (const v of filteredVisits) {
      const key = `${v.visit_date}|${v.start_time}|${v.end_time}|${v.property?.id || v.property_title || ""}`;
      map.set(key, [...(map.get(key) ?? []), v]);
    }
    const list = [...map.values()];
    return visitFilter === "CLOSED" ? list.reverse() : list;
  }, [filteredVisits, visitFilter]);

  const requestedVisitsCount = allVisits.filter((v) => v.status === "REQUESTED").length;

  // Reservations
  const allReservations = useMemo(() => reservationsQuery.data ?? [], [reservationsQuery.data]);
  const confirmedReservationsCount = allReservations.filter(
    (r) => r.status === "CONFIRMED",
  ).length;

  return (
    <View className="flex-1 bg-canvas">
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-4 py-4 pb-32"
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
      >
        {/* Hero Section */}
        <View className="mb-4">
          <Text className="text-xs font-semibold uppercase tracking-[0.18em] text-[#f87000]">
            STAY LISTINGS
          </Text>
          <Text className="mt-1 text-2xl font-black tracking-tight text-navy-900">
            Your stays dashboard
          </Text>
          <Text className="mt-1.5 text-xs font-medium leading-relaxed text-text-secondary">
            Add a property, add its rooms and prices, then publish. Pause any time to hide it — existing bookings go ahead.
          </Text>
          <Pressable
            onPress={() => {
              setEditingProperty(null);
              setPropertySheetOpen(true);
            }}
            className="mt-3.5 self-start rounded-xl bg-[#f87000] px-4 py-2.5 shadow-xs active:opacity-90"
          >
            <Text className="text-xs font-bold text-white">Add a property</Text>
          </Pressable>
        </View>

        {/* Segmented Section Tabs */}
        <View className="mb-4 flex-row items-center rounded-2xl border border-line/60 bg-surface-sunken p-1">
          <Pressable
            onPress={() => setTab("properties")}
            className={cn(
              "flex-1 items-center justify-center rounded-xl py-2 px-3",
              tab === "properties"
                ? "bg-surface shadow-xs"
                : "bg-transparent active:bg-surface-hover/50"
            )}
          >
            <Text
              className={cn(
                "text-xs",
                tab === "properties"
                  ? "font-bold text-navy-900"
                  : "font-semibold text-text-secondary"
              )}
            >
              Properties
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setTab("enquiries")}
            className={cn(
              "flex-1 flex-row items-center justify-center gap-1.5 rounded-xl py-2 px-3",
              tab === "enquiries"
                ? "bg-surface shadow-xs"
                : "bg-transparent active:bg-surface-hover/50"
            )}
          >
            <Text
              className={cn(
                "text-xs",
                tab === "enquiries"
                  ? "font-bold text-navy-900"
                  : "font-semibold text-text-secondary"
              )}
            >
              Enquiries
            </Text>
            {openEnquiriesCount > 0 ? (
              <View className="rounded-full bg-[#f87000] px-1.5 py-0.2">
                <Text className="text-[10px] font-bold text-white">{openEnquiriesCount}</Text>
              </View>
            ) : null}
          </Pressable>

          <Pressable
            onPress={() => setTab("visits")}
            className={cn(
              "flex-1 flex-row items-center justify-center gap-1.5 rounded-xl py-2 px-3",
              tab === "visits"
                ? "bg-surface shadow-xs"
                : "bg-transparent active:bg-surface-hover/50"
            )}
          >
            <Text
              className={cn(
                "text-xs",
                tab === "visits"
                  ? "font-bold text-navy-900"
                  : "font-semibold text-text-secondary"
              )}
            >
              Visits
            </Text>
            {requestedVisitsCount > 0 ? (
              <View className="rounded-full bg-[#f87000] px-1.5 py-0.2">
                <Text className="text-[10px] font-bold text-white">{requestedVisitsCount}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>

        {actionError ? (
          <View className="mb-3 rounded-lg bg-rose-50 p-3">
            <Text className="text-xs text-rose-600 font-medium">{actionError}</Text>
          </View>
        ) : null}

        {/* ===================== TAB: PROPERTIES ===================== */}
        {tab === "properties" && (
          <View className="flex-col gap-4">
            {/* Top Summary Cards */}
            <StaySummaryCards onSelectTab={(t) => setTab(t)} />

            {propertiesQuery.isLoading ? (
              <View className="py-12 items-center">
                <Spinner size="lg" />
              </View>
            ) : propertiesQuery.isError ? (
              <ErrorState
                title="Could not load properties"
                message={propertiesQuery.error?.message ?? "An error occurred"}
                onAction={() => void propertiesQuery.refetch()}
                actionLabel="Retry"
              />
            ) : filteredProperties.length === 0 ? (
              <EmptyState
                title={
                  propertyFilter === "archived"
                    ? "No archived properties"
                    : "No stay properties listed yet"
                }
                description={
                  propertyFilter === "archived"
                    ? "Archived stays will appear here."
                    : "Tap 'Add a property' above to list your PG, room, or hostel."
                }
                action={
                  propertyFilter === "active" ? (
                    <Button
                      onPress={() => {
                        setEditingProperty(null);
                        setPropertySheetOpen(true);
                      }}
                    >
                      Add a Property
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <View className="flex-col">
                {filteredProperties.map((property) => (
                  <PropertyCard
                    key={property.id}
                    property={property}
                    onEditDetails={(p) => {
                      setEditingProperty(p);
                      setPropertySheetOpen(true);
                    }}
                    onManageRooms={(p) => {
                      setUnitProperty(p);
                      setUnitSheetOpen(true);
                    }}
                    onVisitingHours={(p) => {
                      setVisitingHoursProperty(p);
                      setVisitingHoursSheetOpen(true);
                    }}
                    onManagePhotos={(p) => {
                      setEditingProperty(p);
                      setPropertySheetOpen(true);
                    }}
                  />
                ))}

                {properties.some((p) => p.listing_status === "ARCHIVED") ? (
                  <Pressable
                    onPress={() =>
                      setPropertyFilter((curr) => (curr === "active" ? "archived" : "active"))
                    }
                    className="py-3 items-center"
                  >
                    <Text className="text-xs font-semibold text-text-muted active:text-text">
                      {propertyFilter === "archived"
                        ? "← Show active properties"
                        : "View archived properties"}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            )}
          </View>
        )}

        {/* ===================== TAB: ENQUIRIES ===================== */}
        {tab === "enquiries" && (
          <View className="flex-col gap-4 pb-12">
            {/* Filter Pills */}
            <View className="flex-row flex-wrap gap-1.5">
              {(
                [
                  { value: "OPEN", label: "To call" },
                  { value: "CONFIRMED", label: "Booked" },
                  { value: "CLOSED", label: "Closed" },
                  { value: "ALL", label: "All" },
                ] as const
              ).map((f) => {
                const isSelected = enquiryFilter === f.value;
                return (
                  <Pressable
                    key={f.value}
                    onPress={() => setEnquiryFilter(f.value)}
                    className={`rounded-full px-3 py-1 border ${
                      isSelected ? "border-navy-900 bg-navy-900" : "border-line bg-surface"
                    }`}
                  >
                    <Text
                      className={`text-xs font-semibold ${
                        isSelected ? "text-white" : "text-text"
                      }`}
                    >
                      {f.label}
                      {f.value === "OPEN" && openEnquiriesCount > 0 ? ` (${openEnquiriesCount})` : ""}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {enquiriesQuery.isLoading ? (
              <View className="py-12 items-center">
                <Spinner size="lg" />
              </View>
            ) : enquiriesQuery.isError ? (
              <ErrorState
                title="Could not load guest enquiries"
                message={enquiriesQuery.error?.message ?? "An error occurred"}
                onAction={() => void enquiriesQuery.refetch()}
                actionLabel="Retry"
              />
            ) : filteredEnquiries.length === 0 ? (
              <EmptyState
                title={
                  enquiryFilter === "OPEN"
                    ? "Nobody to call right now"
                    : "No enquiries in this view"
                }
                description="When guests enquire about your rooms, they appear here with their contact number."
              />
            ) : (
              <View className="flex-col gap-3">
                {filteredEnquiries.map((enquiry) => (
                  <EnquiryCard
                    key={enquiry.id}
                    enquiry={enquiry}
                    onSelect={(e) => setSelectedEnquiry(e)}
                  />
                ))}
              </View>
            )}
          </View>
        )}

        {/* ===================== TAB: VISITS ===================== */}
        {tab === "visits" && (
          <View className="flex-col gap-4 pb-12">
            {/* Filter Pills */}
            <View className="flex-row flex-wrap gap-1.5">
              {VISIT_FILTERS.map((f) => {
                const isSelected = visitFilter === f.value;
                return (
                  <Pressable
                    key={f.value}
                    onPress={() => setVisitFilter(f.value)}
                    className={`rounded-full px-3 py-1 border ${
                      isSelected ? "border-navy-900 bg-navy-900" : "border-line bg-surface"
                    }`}
                  >
                    <Text
                      className={`text-xs font-semibold ${
                        isSelected ? "text-white" : "text-text"
                      }`}
                    >
                      {f.label}
                      {f.value === "REQUESTED" && requestedVisitsCount > 0
                        ? ` (${requestedVisitsCount})`
                        : ""}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {visitsQuery.isLoading ? (
              <View className="py-12 items-center">
                <Spinner size="lg" />
              </View>
            ) : visitsQuery.isError ? (
              <ErrorState
                title="Could not load visit requests"
                message={visitsQuery.error?.message ?? "An error occurred"}
                onAction={() => void visitsQuery.refetch()}
                actionLabel="Retry"
              />
            ) : visitGroups.length === 0 ? (
              <EmptyState
                title={
                  visitFilter === "REQUESTED"
                    ? "No visit requests to answer"
                    : "No visit requests in this view"
                }
                description="When guests schedule visits during your visiting hours, they appear here."
              />
            ) : (
              <View className="flex-col gap-4">
                {visitGroups.map((group) => {
                  const first = group[0]!;
                  const timeWindow = clockWindow(first.start_time, first.end_time);

                  return (
                    <View key={`${first.visit_date}-${first.start_time}-${first.property?.id || first.property_title}`} className="flex-col gap-2">
                      {/* Slot Header (GAP-S-11) */}
                      <View className="flex-row items-center gap-2 px-1">
                        <CalendarClock size={15} color={THEME_COLORS.action} />
                        <Text className="text-xs font-bold text-text">
                          {dayLabel(first.visit_date)} · {timeWindow}
                          <Text className="font-normal text-text-muted">
                            {" "}· {first.property?.title || first.property_title || "Stay"} · {group.length} visitor{group.length === 1 ? "" : "s"}
                          </Text>
                        </Text>
                      </View>

                      {/* Visits in this slot */}
                      <View className="flex-col gap-2.5">
                        {group.map((visit) => (
                          <VisitCard
                            key={visit.id}
                            visit={visit}
                            onAccept={(v) => visitMutation.mutate({ id: v.id, action: "accept" })}
                            onDecline={(v, reason, note) =>
                              visitMutation.mutate({ id: v.id, action: "decline", reason, note })
                            }
                            onBookRoom={(v, roomId) =>
                              roomBookMutation.mutate({
                                roomId,
                                visitId: v.id,
                                guestName: v.customer_name,
                              })
                            }
                          />
                        ))}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* ===================== TAB: BOOKINGS ===================== */}
        {tab === "bookings" && (
          <View className="flex-col gap-4 pb-12">
            {reservationsQuery.isLoading ? (
              <View className="items-center py-12">
                <Spinner />
              </View>
            ) : reservationsQuery.error ? (
              <ErrorState
                title="Could not load reservations"
                message={reservationsQuery.error?.message ?? "An error occurred"}
                onAction={() => void reservationsQuery.refetch()}
                actionLabel="Retry"
              />
            ) : allReservations.length === 0 ? (
              <EmptyState
                compact
                title="No paid reservations yet"
                description="Hotel and short-stay bookings that guests pay for appear here."
              />
            ) : (
              <View className="flex-col gap-3">
                {allReservations.map((reservation) => (
                  <StayReservationCard
                    key={reservation.id}
                    reservation={reservation}
                    onSelect={setSelectedReservation}
                  />
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Sheets & Dialogs */}
      <PropertySheet
        open={propertySheetOpen}
        onOpenChange={setPropertySheetOpen}
        editingProperty={editingProperty}
      />

      <UnitSheet
        open={unitSheetOpen}
        onOpenChange={setUnitSheetOpen}
        property={unitProperty}
        editingUnit={editingUnit}
      />

      <VisitingHoursSheet
        open={visitingHoursSheetOpen}
        onOpenChange={setVisitingHoursSheetOpen}
        property={visitingHoursProperty}
      />

      <StayEnquiryDetailSheet
        open={selectedEnquiry !== null}
        enquiry={selectedEnquiry}
        onOpenChange={(open) => {
          if (!open) setSelectedEnquiry(null);
        }}
        onBooked={(id, roomId) => enquiryMutation.mutate({ id, action: "booked", roomId })}
        onNotAvailable={(id, note) => enquiryMutation.mutate({ id, action: "not_available", note })}
        onCancelBooking={(id) => enquiryMutation.mutate({ id, action: "cancel" })}
        isPending={enquiryMutation.isPending}
        actionError={actionError}
      />

      <StayReservationDetailSheet
        open={selectedReservation !== null}
        reservation={selectedReservation}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedReservation(null);
            reservationMutation.reset();
          }
        }}
        onCheckIn={(id) => reservationMutation.mutate({ id, action: "check_in" })}
        onCheckOut={(id) => reservationMutation.mutate({ id, action: "check_out" })}
        onNoShow={(id) => reservationMutation.mutate({ id, action: "no_show" })}
        onCancel={(id, reason) => reservationMutation.mutate({ id, action: "cancel", reason })}
        isPending={reservationMutation.isPending}
        actionError={actionError}
      />
    </View>
  );
}
