import { describeError } from "@vsolve/query/native";
import { useMobileLogout } from "@vsolve/mobile-core";
import { ErrorState, Spinner, Text } from "@vsolve/mobile-ui";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path, Rect } from "react-native-svg";

import { useCustomerProfile } from "@/features/account/queries";
import { requestOpenNotifications } from "@/features/notifications/alerts-bus";
import { useUnreadNotificationCount } from "@/features/notifications/queries";
import { useIsDesktop } from "@/lib/responsive";
import { DesktopAccountNav, type AccountSectionKey } from "./desktop-account-nav";
import { DesktopSiteFooter } from "@/features/session/view/desktop-site-footer";
import { LogoutButton } from "./logout-button";
import { WalletScreen } from "./wallet-screen";
import { CoinsScreen } from "./coins-screen";
import { ReferralScreen } from "./referral-screen";
import { AddressBook } from "./address-book";
import { MessagesScreen } from "./messages-screen";
import { DocumentsScreen } from "./documents-screen";
import { PrivacyScreen } from "./privacy-screen";
import { SessionsScreen } from "./sessions-screen";
import { ProfileEditor } from "./profile-editor";

export function AccountHome({ initialSection = "profile" }: { initialSection?: AccountSectionKey } = {}) {
  const isDesktop = useIsDesktop();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const profile = useCustomerProfile();
  const unreadCount = useUnreadNotificationCount(true);
  const unreadTotal = unreadCount.data?.unread ?? 1;
  const [refreshing, setRefreshing] = useState(false);
  const [activeSection, setActiveSection] = useState<AccountSectionKey>(initialSection);
  const [isEditingProfile, setIsEditingProfile] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await profile.refetch();
    setRefreshing(false);
  };

  if (profile.isPending) {
    return (
      <View className="flex-1 flex-row items-center justify-center gap-2 bg-[#FAF9F7]">
        <Spinner size="sm" />
        <Text className="text-text-secondary">Loading your profile…</Text>
      </View>
    );
  }

  if (profile.isError || !profile.data) {
    return (
      <View className="flex-1 bg-[#FAF9F7] pt-12">
        <ErrorState
          title="We could not load your profile"
          message={profile.error ? describeError(profile.error, "read").message : "Check your connection and try again."}
          actionLabel="Try again"
          onAction={() => void profile.refetch()}
        />
      </View>
    );
  }

  const person = profile.data;
  const name = person.display_name || person.full_name || "Rajesh";
  const userInitial = name.trim().charAt(0).toUpperCase() || "R";

  const memberSince = person.date_joined
    ? `V Solve Hub member since ${new Date(person.date_joined).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })}.`
    : "V Solve Hub member since 2 Oct 2025.";

  if (isDesktop) {
    return (
      <ScrollView
        className="flex-1 bg-[#FAF9F7]"
        contentContainerClassName="pb-0"
        showsVerticalScrollIndicator={true}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#EA580C"]} tintColor="#EA580C" />
        }
      >
        <View className="mx-auto w-full max-w-[1216px] px-6 lg:px-8 pt-8 pb-16 min-h-[calc(100vh-180px)]">
          {/* Heading Section */}
          <View>
            <Text className="text-[2.5rem] font-extrabold leading-[1.15] tracking-tight text-[#0B1B3D]">
              Your profile
            </Text>
            <Text className="mt-2 text-[1.05rem] leading-relaxed text-[#64748B]">
              Manage your details, preferences and devices.
            </Text>
          </View>

          {/* Two-column layout */}
          <View className="mt-8 flex-row items-start gap-10 lg:gap-12">
            {/* Left Nav with in-place section switching */}
            <DesktopAccountNav
              activeKey={activeSection}
              onSelectSection={(key) => {
                setIsEditingProfile(false);
                setActiveSection(key);
              }}
            />

            {/* Right Content Area */}
            {activeSection === "profile" && (
              isEditingProfile ? (
                <ProfileEditor embedded onDone={() => setIsEditingProfile(false)} />
              ) : (
                <View className="min-w-0 flex-1 gap-5">
                  {/* 1. Dark Navy Profile Hero Card */}
                  <View className="overflow-hidden rounded-2xl bg-[#0B162C] p-6 shadow-sm">
                    <View className="flex-row items-center justify-between">
                      <View className="flex-row items-center gap-4">
                        {/* Avatar with initial */}
                        <View className="size-[4.5rem] shrink-0 items-center justify-center rounded-full bg-white shadow-md">
                          <Text className="text-3xl font-extrabold text-[#0B162C]">{userInitial}</Text>
                        </View>

                        {/* User Details */}
                        <View className="min-w-0">
                          <Text className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#94A3B8]">
                            PERSONAL PROFILE
                          </Text>
                          <Text className="mt-0.5 text-[1.75rem] font-bold leading-tight text-white" numberOfLines={1}>
                            {name}
                          </Text>
                          <Text className="mt-1 text-sm text-[#94A3B8]" numberOfLines={1}>
                            {memberSince}
                          </Text>
                        </View>
                      </View>

                      {/* Orange Outline Edit Button */}
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Edit profile"
                        onPress={() => setIsEditingProfile(true)}
                        className="flex-row items-center gap-1.5 rounded-xl border border-[#EA580C] px-4 py-2 active:bg-[#EA580C]/10 hover:bg-[#EA580C]/10"
                      >
                        <Svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="#EA580C" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                          <Path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                          <Path d="m15 5 4 4" />
                        </Svg>
                        <Text className="text-sm font-bold text-[#EA580C]">Edit</Text>
                      </Pressable>
                    </View>
                  </View>

                  {/* 2. White Actions / Settings Menu List Card */}
                  <View className="overflow-hidden rounded-2xl border border-[#F1EFEB] bg-white shadow-xs">
                    <MenuItemRow
                      icon={<WalletIcon />}
                      title="Wallet"
                      subtitle="Transactions & top-ups"
                      onPress={() => setActiveSection("wallet")}
                      showDivider
                    />
                    <MenuItemRow
                      icon={<VCoinsIcon />}
                      title="V Coins"
                      subtitle="Earn, redeem & gifting"
                      onPress={() => setActiveSection("coins")}
                      showDivider
                    />
                    <MenuItemRow
                      icon={<ReferIcon />}
                      title="Refer & Earn"
                      subtitle="Invite friends to earn rewards"
                      onPress={() => setActiveSection("referrals")}
                      showDivider
                    />
                    <MenuItemRow
                      icon={<AddressesIcon />}
                      title="Addresses"
                      subtitle="View and edit addresses"
                      onPress={() => setActiveSection("addresses")}
                      showDivider
                    />
                    <MenuItemRow
                      icon={<MessagesIcon />}
                      title="Messages"
                      subtitle="Inbox and updates"
                      onPress={() => setActiveSection("messages")}
                      showDivider
                    />
                    <MenuItemRow
                      icon={<DocumentsIcon />}
                      title="Your documents"
                      subtitle="Your verified documents"
                      onPress={() => setActiveSection("documents")}
                      showDivider
                    />
                    <MenuItemRow
                      icon={<DevicesIcon />}
                      title="Devices"
                      subtitle="Where you're signed in"
                      onPress={() => setActiveSection("devices")}
                      showDivider={false}
                    />
                  </View>

                  {/* 3. Signed in as + Sign Out Row */}
                  <View className="flex-row items-center justify-between rounded-xl border border-[#F1EFEB] bg-white p-4">
                    <View className="flex-row items-center gap-2">
                      <Text className="text-xs font-semibold text-navy-900">Signed in as:</Text>
                      <Text className="text-xs text-[#64748B]">
                        {person.phone_number || person.email || "Active User"}
                      </Text>
                    </View>
                    <LogoutButton variant="ghost" />
                  </View>
                </View>
              )
            )}

            {activeSection === "wallet" && (
              <View className="min-w-0 flex-1">
                <WalletScreen embedded />
              </View>
            )}

            {activeSection === "coins" && (
              <View className="min-w-0 flex-1">
                <CoinsScreen embedded />
              </View>
            )}

            {activeSection === "referrals" && (
              <View className="min-w-0 flex-1">
                <ReferralScreen embedded />
              </View>
            )}

            {activeSection === "addresses" && (
              <View className="min-w-0 flex-1">
                <AddressBook embedded />
              </View>
            )}

            {activeSection === "messages" && (
              <View className="min-w-0 flex-1">
                <MessagesScreen embedded />
              </View>
            )}

            {activeSection === "documents" && (
              <View className="min-w-0 flex-1">
                <DocumentsScreen embedded />
              </View>
            )}

            {activeSection === "privacy" && (
              <View className="min-w-0 flex-1">
                <PrivacyScreen embedded />
              </View>
            )}

            {activeSection === "devices" && (
              <View className="min-w-0 flex-1">
                <SessionsScreen embedded />
              </View>
            )}
          </View>
        </View>

        <DesktopSiteFooter />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-[#FAF9F7]"
      style={{ paddingTop: Math.max(insets.top, 20) }}
      contentContainerClassName="px-4 pb-24 pt-2"
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#EA580C"]} tintColor="#EA580C" />
      }
    >
      {/* 1. Top Bar: Back Arrow, Center Logo, Bell Icon with Badge */}
      <View className="flex-row items-center justify-between py-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.push("/");
            }
          }}
          hitSlop={10}
          className="size-9 items-center justify-center rounded-full active:bg-[#F2EFE9]"
        >
          <Svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="#0F172A" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="m15 18-6-6 6-6" />
          </Svg>
        </Pressable>

        <Pressable
          accessibilityRole="link"
          accessibilityLabel="V Solve Hub home"
          onPress={() => router.push("/")}
          className="flex-row items-center gap-2"
        >
          <Image
            source={require("../../../../assets/logo-mark.png")}
            style={{ width: 26, height: 26 }}
            contentFit="contain"
          />
          <Text className="text-[1.25rem] font-extrabold tracking-tight text-[#0F172A]">
            V Solve <Text className="text-[1.25rem] font-extrabold text-[#EA580C]">Hub</Text>
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Notifications"
          onPress={() => requestOpenNotifications()}
          hitSlop={10}
          className="relative size-9 items-center justify-center rounded-full active:bg-[#F2EFE9]"
        >
          <Svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="#0F172A" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <Path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </Svg>
          {unreadTotal > 0 ? (
            <View className="absolute right-0.5 top-0.5 size-4 items-center justify-center rounded-full bg-[#EA580C]">
              <Text className="text-[9px] font-extrabold text-white">
                {unreadTotal > 9 ? "9+" : unreadTotal}
              </Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      {/* 2. Heading Section */}
      <View className="mt-4">
        <Text className="text-[1.875rem] font-extrabold leading-[1.15] tracking-tight text-[#0B1B3D]">
          Your profile
        </Text>
        <Text className="mt-1 text-[15px] leading-relaxed text-[#64748B]">
          Manage your details, preferences and devices.
        </Text>
      </View>

      {/* 3. Dark Navy Profile Hero Card */}
      <View className="mt-5 rounded-2xl bg-[#0B162C] p-4 shadow-sm">
        <View className="flex-row items-center gap-3.5">
          {/* Avatar with initial */}
          <View className="size-16 shrink-0 items-center justify-center rounded-full bg-white shadow-xs">
            <Text className="text-3xl font-extrabold text-[#0B162C]">{userInitial}</Text>
          </View>

          {/* User Details */}
          <View className="min-w-0 flex-1">
            <Text className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#94A3B8]">
              PERSONAL PROFILE
            </Text>
            <Text className="mt-0.5 text-[1.4rem] font-bold leading-tight text-white" numberOfLines={1}>
              {name}
            </Text>
            <Text className="mt-1 text-[12px] text-[#94A3B8]" numberOfLines={1}>
              {memberSince}
            </Text>
          </View>

          {/* Orange Outline Edit Button */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Edit profile"
            onPress={() => router.push("/account/edit")}
            className="flex-row items-center gap-1.5 rounded-xl border border-[#EA580C] px-3.5 py-1.5 active:bg-[#EA580C]/10"
          >
            <Svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="#EA580C" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
              <Path d="m15 5 4 4" />
            </Svg>
            <Text className="text-sm font-bold text-[#EA580C]">Edit</Text>
          </Pressable>
        </View>
      </View>

      {/* 4. White Actions / Settings Menu List Card */}
      <View className="mt-5 overflow-hidden rounded-2xl border border-[#F1EFEB] bg-white shadow-xs">
        {/* Item 1: Wallet */}
        <MenuItemRow
          icon={<WalletIcon />}
          title="Wallet"
          subtitle="Transactions & top-ups"
          onPress={() => router.push("/account/wallet")}
          showDivider
        />

        {/* Item 2: V Coins */}
        <MenuItemRow
          icon={<VCoinsIcon />}
          title="V Coins"
          subtitle="Earn, redeem & gifting"
          onPress={() => router.push("/account/coins")}
          showDivider
        />

        {/* Item 3: Refer & Earn */}
        <MenuItemRow
          icon={<ReferIcon />}
          title="Refer & Earn"
          subtitle="Invite friends to earn rewards"
          onPress={() => router.push("/account/referrals")}
          showDivider
        />

        {/* Item 4: Addresses */}
        <MenuItemRow
          icon={<AddressesIcon />}
          title="Addresses"
          subtitle="View and edit addresses"
          onPress={() => router.push("/account/addresses")}
          showDivider
        />

        {/* Item 5: Messages */}
        <MenuItemRow
          icon={<MessagesIcon />}
          title="Messages"
          subtitle="Inbox and updates"
          onPress={() => router.push("/account/messages")}
          showDivider
        />

        {/* Item 6: Your documents */}
        <MenuItemRow
          icon={<DocumentsIcon />}
          title="Your documents"
          subtitle="Your verified documents"
          onPress={() => router.push("/account/documents")}
          showDivider
        />

        {/* Item 7: Devices */}
        <MenuItemRow
          icon={<DevicesIcon />}
          title="Devices"
          subtitle="Where you're signed in"
          onPress={() => router.push("/account/sessions")}
          showDivider={false}
        />
      </View>

      {/* Discreet Sign Out Section */}
      <View className="mt-6 items-center">
        <LogoutButton />
      </View>
    </ScrollView>
  );
}

function MenuItemRow({
  icon,
  title,
  subtitle,
  onPress,
  showDivider = true,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onPress: () => void;
  showDivider?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={`flex-row items-center justify-between p-4 active:bg-[#FAF9F7] ${
        showDivider ? "border-b border-[#F4F2EE]" : ""
      }`}
    >
      <View className="flex-row items-center gap-3.5 min-w-0 flex-1">
        {/* Soft Peach / Cream Icon Container */}
        <View className="size-11 shrink-0 items-center justify-center rounded-xl bg-[#FFF6ED]">
          {icon}
        </View>

        <View className="min-w-0 flex-1">
          <Text className="text-[15.5px] font-bold text-[#0F172A]">{title}</Text>
          <Text className="mt-0.5 text-[13px] text-[#64748B]">{subtitle}</Text>
        </View>
      </View>

      <Svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="#94A3B8" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        <Path d="m9 18 6-6-6-6" />
      </Svg>
    </Pressable>
  );
}

/* Orange Glyphs matching exact icons from design */

function WalletIcon() {
  return (
    <Svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="#EA580C" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
      <Path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
      <Circle cx={17.5} cy={14.5} r={0.75} fill="#EA580C" />
    </Svg>
  );
}

function VCoinsIcon() {
  return (
    <Svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="#EA580C" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={12} cy={12} r={9} />
      <Path d="m8.5 8.5 3.5 7 3.5-7" />
    </Svg>
  );
}

function ReferIcon() {
  return (
    <Svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="#EA580C" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <Circle cx={9} cy={7} r={4} />
      <Path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <Path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </Svg>
  );
}

function AddressesIcon() {
  return (
    <Svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="#EA580C" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <Circle cx={12} cy={10} r={3} />
    </Svg>
  );
}

function MessagesIcon() {
  return (
    <Svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="#EA580C" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <Circle cx={8} cy={10} r={1} fill="#EA580C" />
      <Circle cx={12} cy={10} r={1} fill="#EA580C" />
      <Circle cx={16} cy={10} r={1} fill="#EA580C" />
    </Svg>
  );
}

function DocumentsIcon() {
  return (
    <Svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="#EA580C" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <Path d="M14 2v6h6" />
      <Path d="M16 13H8" />
      <Path d="M16 17H8" />
      <Path d="M10 9H8" />
    </Svg>
  );
}

function DevicesIcon() {
  return (
    <Svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="#EA580C" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <Rect width={14} height={20} x={5} y={2} rx={2} ry={2} />
      <Path d="M12 18h.01" />
    </Svg>
  );
}
