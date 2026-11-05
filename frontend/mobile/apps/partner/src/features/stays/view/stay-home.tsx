import { useQuery } from "@tanstack/react-query";
import { Text, formatMoney } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import {
  BedDouble,
  CalendarClock,
  LogIn,
  LogOut,
  MessageSquare,
  Phone,
  Star,
} from "lucide-react-native";
import { useMemo, useState } from "react";
import {
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import Svg, { Defs, Pattern, Path, Rect } from "react-native-svg";

import { usePartnerPerformance } from "../../earnings/queries";

import {
  type PartnerStayVisit,
  type StayEnquiry,
  clockWindow,
  dayLabel,
} from "../model";
import {
  fetchPartnerStayEnquiries,
  fetchPartnerStayProperties,
  fetchPartnerStayReservations,
  fetchPartnerStaySummary,
  fetchPartnerStayVisits,
} from "../queries";

function isoToday(now: Date): string {
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${m}-${d}`;
}

function dayOf(value: string | null | undefined): string {
  return (value ?? "").slice(0, 10);
}

export function StayHome() {
  const router = useRouter();
  const [now] = useState(() => new Date());
  const today = isoToday(now);

  const performance = usePartnerPerformance();
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

  const isRefreshing =
    summaryQuery.isRefetching ||
    propertiesQuery.isRefetching ||
    enquiriesQuery.isRefetching ||
    visitsQuery.isRefetching ||
    reservationsQuery.isRefetching ||
    performance.isRefetching;

  const onRefresh = () => {
    void summaryQuery.refetch();
    void propertiesQuery.refetch();
    void enquiriesQuery.refetch();
    void visitsQuery.refetch();
    void reservationsQuery.refetch();
    void performance.refetch();
  };

  const summary = summaryQuery.data;
  const properties = propertiesQuery.data ?? [];
  const enquiries = enquiriesQuery.data ?? [];
  const visits = visitsQuery.data ?? [];
  const reservations = reservationsQuery.data ?? [];

  // Counts from the server. Zero until it answers, never a sample number.
  const roomsFree = summary?.available_rooms ?? 0;
  const roomsBooked = summary?.booked_rooms ?? 0;
  const totalRooms = summary?.total_rooms ?? 0;
  const totalProperties = summary?.total_properties ?? properties.length;
  const liveProperties =
    (summary as any)?.live_properties ??
    (properties.length > 0
      ? properties.filter((p) => p.listing_status !== "ARCHIVED").length
      : 0);
  const reviewCount = summary?.review_count ?? 0;
  const averageRating = summary?.average_rating ?? 0;

  // 1. Calls to make: enquiries with status SUBMITTED
  const toCall = useMemo(() => enquiries.filter((e) => e.status === "SUBMITTED"), [enquiries]);

  // 2. Visits to answer: status REQUESTED
  const visitRequests = useMemo(
    () => visits.filter((v) => v.status === "REQUESTED"),
    [visits],
  );

  // 3. Visits today: status ACCEPTED and visit_date === today
  const visitsToday = useMemo(
    () => visits.filter((v) => v.status === "ACCEPTED" && v.visit_date === today),
    [visits, today],
  );

  // 4. Arriving today: check_in === today
  const arriving = useMemo(() => {
    const list: Array<{ id: string; title: string; who: string; phone?: string }> = [];
    for (const e of enquiries) {
      if (e.status === "CONFIRMED" && dayOf(e.check_in) === today) {
        list.push({
          id: `arr-e-${e.id}`,
          title: e.property_title + (e.unit_name ? ` · ${e.unit_name}` : ""),
          who: e.customer_name || "Guest",
          phone: e.customer_phone,
        });
      }
    }
    for (const r of reservations) {
      if (r.status === "CONFIRMED" && dayOf(r.check_in) === today) {
        list.push({
          id: `arr-r-${r.id}`,
          title: (r.property_title ?? "Stay") + (r.unit_name ? ` · ${r.unit_name}` : ""),
          who: r.customer_name || "Guest",
          phone: r.customer_phone,
        });
      }
    }
    return list;
  }, [enquiries, reservations, today]);

  // 5. Leaving today: check_out <= today
  const leaving = useMemo(() => {
    const list: Array<{ id: string; title: string; who: string; phone?: string }> = [];
    for (const e of enquiries) {
      if (e.status === "CONFIRMED" && dayOf(e.check_out) === today) {
        list.push({
          id: `dep-e-${e.id}`,
          title: e.property_title + (e.unit_name ? ` · ${e.unit_name}` : ""),
          who: e.customer_name || "Guest",
          phone: e.customer_phone,
        });
      }
    }
    for (const r of reservations) {
      if (r.status === "CHECKED_IN" && dayOf(r.check_out) <= today) {
        list.push({
          id: `dep-r-${r.id}`,
          title: (r.property_title ?? "Stay") + (r.unit_name ? ` · ${r.unit_name}` : ""),
          who: r.customer_name || "Guest",
          phone: r.customer_phone,
        });
      }
    }
    return list;
  }, [enquiries, reservations, today]);

  // Earnings strip values
  const todayNetPaise = performance.data?.today_net_paise ?? 0;
  const todayJobs = performance.data?.today_jobs ?? 0;
  const monthNetPaise = performance.data?.month_net_paise ?? 0;
  const monthJobs = performance.data?.month_jobs ?? 0;
  const averageNetPaise = performance.data?.average_monthly_net_paise ?? 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={onRefresh}
          tintColor="#f87000"
          colors={["#f87000"]}
        />
      }
    >
      {/* 1. Dark Navy Top Hero: Earned Today & Performance Strip */}
      <View style={styles.darkHero}>
        {/* Subtle blueprint grid overlay matching mockup */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Svg width="100%" height="100%">
            <Defs>
              <Pattern
                id="heroGrid"
                width="34"
                height="34"
                patternUnits="userSpaceOnUse"
              >
                <Path
                  d="M 34 0 L 0 0 0 34"
                  fill="none"
                  stroke="rgba(255, 255, 255, 0.05)"
                  strokeWidth="1"
                />
              </Pattern>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#heroGrid)" />
          </Svg>
        </View>

        <View style={styles.heroTopRow}>
          <View>
            <Text style={styles.earnedTodayLabel}>EARNED TODAY</Text>
            <Text style={styles.earnedTodayValue}>
              {formatMoney(todayNetPaise)}
            </Text>
          </View>
          <Text style={styles.noJobsText}>
            {todayJobs === 0 ? "No jobs\nyet today" : `${todayJobs} jobs\nfinished`}
          </Text>
        </View>

        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{formatMoney(monthNetPaise)}</Text>
            <Text style={styles.metricLabel}>This month</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{monthJobs}</Text>
            <Text style={styles.metricLabel}>Jobs done</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{formatMoney(averageNetPaise)}</Text>
            <Text style={styles.metricLabel}>Usual month</Text>
          </View>
        </View>
      </View>

      {/* 2. White Sheet with Rounded Top Corners */}
      <View style={styles.sheetContainer}>
        {/* Subtle pill handle */}
        <View style={styles.handleBar} />

        {/* 2x2 Stat Cards Grid */}
        <View style={styles.statsGrid}>
          {/* Row 1 */}
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Rooms free</Text>
              <Text style={styles.statNumberGreen}>{roomsFree}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Rooms booked</Text>
              <Text style={styles.statNumberAmber}>{roomsBooked}</Text>
            </View>
          </View>

          {/* Row 2 */}
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Total rooms</Text>
              <Text style={styles.statNumberNavy}>{totalRooms}</Text>
              <Text style={styles.statSubtext}>
                {liveProperties} of {totalProperties} properties live
              </Text>
            </View>
            <View style={styles.statCard}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                <Star size={13} color="#64748b" />
                <Text style={styles.statLabel}>Reviews</Text>
              </View>
              <Text style={styles.statNumberNavy}>{reviewCount}</Text>
              <Text style={styles.statSubtext}>★ {averageRating} average</Text>
            </View>
          </View>
        </View>

        {/* Section: CALL BACK */}
        <View style={styles.sectionHeader}>
          <MessageSquare size={16} color="#64748b" />
          <Text style={styles.sectionTitle}>CALL BACK</Text>
          {toCall.length > 0 ? (
            <View style={styles.orangeBadge}>
              <Text style={styles.orangeBadgeText}>{toCall.length}</Text>
            </View>
          ) : null}
        </View>

        {toCall.length > 0 ? (
          toCall.map((item) => {
            const customerName = item.customer_name || "Guest";
            const propertyUnit =
              (item.property_title || "Stay Property") +
              (item.unit_name ? ` · ${item.unit_name}` : "");
            const checkInDay = item.check_in
              ? dayLabel(dayOf(item.check_in))
              : "Mon, 9 Nov";
            const guestCount = item.guest_count ?? 1;
            const guestText = `${guestCount} ${guestCount === 1 ? "guest" : "guests"}`;

            return (
              <View key={item.id} style={styles.callBackCard}>
                <View style={styles.callBackInfo}>
                  <Text style={styles.callBackName}>{customerName}</Text>
                  <Text style={styles.callBackProperty} numberOfLines={1}>
                    {propertyUnit}
                  </Text>
                  <Text style={styles.callBackMeta}>
                    Wants {checkInDay} · {guestText}
                  </Text>
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Call ${customerName}`}
                  onPress={() => {
                    if (item.customer_phone) {
                      void Linking.openURL(`tel:${item.customer_phone}`);
                    }
                  }}
                  style={({ pressed }) => [
                    styles.callButton,
                    pressed ? styles.callButtonPressed : null,
                  ]}
                >
                  <Phone size={14} color="#00112e" />
                  <Text style={styles.callButtonText}>Call</Text>
                </Pressable>
              </View>
            );
          })
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyCardText}>No calls waiting.</Text>
          </View>
        )}

        {/* Section: VISIT REQUESTS TO ANSWER */}
        <View style={styles.sectionHeader}>
          <CalendarClock size={16} color="#64748b" />
          <Text style={styles.sectionTitle}>VISIT REQUESTS TO ANSWER</Text>
        </View>

        {visitRequests.length > 0 ? (
          visitRequests.map((v) => (
            <View key={v.id} style={styles.callBackCard}>
              <View style={styles.callBackInfo}>
                <Text style={styles.callBackName}>
                  {v.customer_name || "Visitor"}
                </Text>
                <Text style={styles.callBackProperty} numberOfLines={1}>
                  {v.property_title}
                </Text>
                <Text style={styles.callBackMeta}>
                  {dayLabel(v.visit_date)},{" "}
                  {clockWindow(v.start_time, v.end_time)}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push("/stays/visits" as any)}
                style={styles.callButton}
              >
                <Text style={styles.callButtonText}>Answer</Text>
              </Pressable>
            </View>
          ))
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyCardText}>No visit requests waiting.</Text>
          </View>
        )}

        {/* Section: VISITS TODAY */}
        <View style={styles.sectionHeader}>
          <CalendarClock size={16} color="#64748b" />
          <Text style={styles.sectionTitle}>VISITS TODAY</Text>
        </View>

        {visitsToday.length > 0 ? (
          visitsToday.map((v) => (
            <View key={v.id} style={styles.callBackCard}>
              <View style={styles.callBackInfo}>
                <Text style={styles.callBackName}>
                  {v.customer_name || "Visitor"}
                </Text>
                <Text style={styles.callBackProperty} numberOfLines={1}>
                  {v.property_title}
                </Text>
                <Text style={styles.callBackMeta}>
                  {clockWindow(v.start_time, v.end_time)}
                </Text>
              </View>
              {v.customer_phone ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void Linking.openURL(`tel:${v.customer_phone}`)}
                  style={styles.callButton}
                >
                  <Phone size={14} color="#00112e" />
                  <Text style={styles.callButtonText}>Call</Text>
                </Pressable>
              ) : null}
            </View>
          ))
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyCardText}>No visits today.</Text>
          </View>
        )}

        {/* Section: ARRIVING TODAY */}
        <View style={styles.sectionHeader}>
          <LogIn size={16} color="#64748b" />
          <Text style={styles.sectionTitle}>ARRIVING TODAY</Text>
        </View>

        {arriving.length > 0 ? (
          arriving.map((item) => (
            <View key={item.id} style={styles.callBackCard}>
              <View style={styles.callBackInfo}>
                <Text style={styles.callBackName}>{item.who}</Text>
                <Text style={styles.callBackProperty} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={styles.callBackMeta}>Checking in today</Text>
              </View>
              {item.phone ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void Linking.openURL(`tel:${item.phone}`)}
                  style={styles.callButton}
                >
                  <Phone size={14} color="#00112e" />
                  <Text style={styles.callButtonText}>Call</Text>
                </Pressable>
              ) : null}
            </View>
          ))
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyCardText}>No one moves in today.</Text>
          </View>
        )}

        {/* Section: LEAVING TODAY */}
        <View style={styles.sectionHeader}>
          <LogOut size={16} color="#64748b" />
          <Text style={styles.sectionTitle}>LEAVING TODAY</Text>
        </View>

        {leaving.length > 0 ? (
          leaving.map((item) => (
            <View key={item.id} style={styles.callBackCard}>
              <View style={styles.callBackInfo}>
                <Text style={styles.callBackName}>{item.who}</Text>
                <Text style={styles.callBackProperty} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={styles.callBackMeta}>Checking out today</Text>
              </View>
              {item.phone ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void Linking.openURL(`tel:${item.phone}`)}
                  style={styles.callButton}
                >
                  <Phone size={14} color="#00112e" />
                  <Text style={styles.callButtonText}>Call</Text>
                </Pressable>
              ) : null}
            </View>
          ))
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyCardText}>No one leaves today.</Text>
          </View>
        )}

        {/* Bottom Quick Action CTAs */}
        <View className="mt-6 flex-row flex-wrap items-center gap-3">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Manage rooms"
            onPress={() => router.push("/stays" as any)}
            className="flex-row items-center gap-2 rounded-2xl bg-[#f87000] px-5 py-3.5 shadow-sm active:opacity-90"
            style={{
              backgroundColor: "#f87000",
              borderRadius: 14,
              paddingHorizontal: 20,
              paddingVertical: 14,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
            }}
          >
            <BedDouble size={18} color="#ffffff" strokeWidth={2.4} />
            <Text
              className="text-sm font-bold text-white"
              style={{ color: "#ffffff", fontSize: 14, fontWeight: "700" }}
            >
              Manage rooms
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="View enquiries"
            onPress={() => router.push("/stays/enquiries" as any)}
            className="flex-row items-center gap-1.5 rounded-2xl border border-slate-300 bg-white px-5 py-3.5 shadow-sm active:bg-slate-50"
            style={{
              backgroundColor: "#ffffff",
              borderWidth: 1.5,
              borderColor: "#cbd5e1",
              borderRadius: 14,
              paddingHorizontal: 20,
              paddingVertical: 14,
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Text
              className="text-sm font-bold text-navy-900"
              style={{ color: "#00112e", fontSize: 14, fontWeight: "700" }}
            >
              Enquiries →
            </Text>
          </Pressable>
        </View>

        <View className="mt-3 self-start">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="View visits"
            onPress={() => router.push("/stays/visits" as any)}
            className="flex-row items-center gap-1.5 rounded-2xl border border-slate-300 bg-white px-5 py-3.5 shadow-sm active:bg-slate-50"
            style={{
              backgroundColor: "#ffffff",
              borderWidth: 1.5,
              borderColor: "#cbd5e1",
              borderRadius: 14,
              paddingHorizontal: 20,
              paddingVertical: 14,
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Text
              className="text-sm font-bold text-navy-900"
              style={{ color: "#00112e", fontSize: 14, fontWeight: "700" }}
            >
              Visits →
            </Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#00112e",
  },
  scrollContent: {
    paddingBottom: 130,
  },
  darkHero: {
    backgroundColor: "#00112e",
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 32,
    position: "relative",
    overflow: "hidden",
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  earnedTodayLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#94a3b8",
    letterSpacing: 0.9,
    textTransform: "uppercase",
  },
  earnedTodayValue: {
    fontSize: 34,
    fontWeight: "900",
    color: "#ffffff",
    marginTop: 4,
    letterSpacing: -0.5,
  },
  noJobsText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#94a3b8",
    textAlign: "right",
    lineHeight: 18,
    marginBottom: 4,
  },
  metricsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 18,
  },
  metricCard: {
    flex: 1,
    backgroundColor: "rgba(255, 255, 255, 0.07)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  metricValue: {
    fontSize: 17,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: -0.2,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: "500",
    color: "#94a3b8",
    marginTop: 3,
  },
  sheetContainer: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    marginTop: -16,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 48,
  },
  handleBar: {
    width: 44,
    height: 4,
    backgroundColor: "#cbd5e1",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  statsGrid: {
    gap: 10,
    marginBottom: 8,
  },
  statsRow: {
    flexDirection: "row",
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 14,
    minHeight: 88,
    justifyContent: "space-between",
  },
  statLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
  },
  statNumberGreen: {
    fontSize: 24,
    fontWeight: "800",
    color: "#16a34a",
    marginTop: 2,
  },
  statNumberAmber: {
    fontSize: 24,
    fontWeight: "800",
    color: "#b45309",
    marginTop: 2,
  },
  statNumberNavy: {
    fontSize: 24,
    fontWeight: "800",
    color: "#00112e",
    marginTop: 2,
  },
  statSubtext: {
    fontSize: 11,
    fontWeight: "500",
    color: "#64748b",
    marginTop: 2,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 22,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#64748b",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  orangeBadge: {
    backgroundColor: "#f97316",
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 2,
  },
  orangeBadgeText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "800",
  },
  callBackCard: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  callBackInfo: {
    flex: 1,
    paddingRight: 12,
  },
  callBackName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#00112e",
  },
  callBackProperty: {
    fontSize: 12,
    fontWeight: "500",
    color: "#475569",
    marginTop: 3,
  },
  callBackMeta: {
    fontSize: 12,
    fontWeight: "700",
    color: "#00112e",
    marginTop: 4,
  },
  callButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#ffffff",
    borderWidth: 1.5,
    borderColor: "#cbd5e1",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  callButtonPressed: {
    backgroundColor: "#f1f5f9",
  },
  callButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#00112e",
  },
  emptyCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1.2,
    borderColor: "#e2e8f0",
    borderStyle: "dashed",
    paddingVertical: 18,
    paddingHorizontal: 16,
    marginBottom: 6,
  },
  emptyCardText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#64748b",
  },
  actionButtonsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 22,
  },
  manageRoomsButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#f97316",
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 13,
  },
  manageRoomsButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
  outlineActionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#ffffff",
    borderWidth: 1.5,
    borderColor: "#cbd5e1",
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 13,
  },
  outlineActionButtonText: {
    color: "#00112e",
    fontSize: 14,
    fontWeight: "700",
  },
});
