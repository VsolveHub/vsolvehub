// Ported from frontend/apps/customer/features/account/view/profile-overview.tsx
import { describeError } from "@vsolve/query/native";
import { useMobileLogout } from "@vsolve/mobile-core";
import { Dialog, ErrorState, Input, Spinner, Text } from "@vsolve/mobile-ui";
import * as WebBrowser from "expo-web-browser";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import Svg, { Circle, Defs, Path, Pattern, Rect } from "react-native-svg";

import { useCustomerProfile, useUpdateCustomerProfile } from "@/features/account/queries";
import { requestOpenNotifications } from "@/features/notifications/alerts-bus";

const WEB_BASE = process.env.EXPO_PUBLIC_WEB_BASE_URL ?? "https://vsolvehub.com";

export function AccountHome() {
  const router = useRouter();
  const profile = useCustomerProfile();
  const update = useUpdateCustomerProfile();
  const signOut = useMobileLogout();
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDisplay, setEditDisplay] = useState("");
  const [editEmail, setEditEmail] = useState("");

  if (profile.isPending) {
    return (
      <View className="flex-1 flex-row items-center justify-center gap-2 bg-[#FAF9F7]">
        <Spinner size="sm" />
        <Text className="text-text-secondary">Loading your account…</Text>
      </View>
    );
  }
  if (profile.isError || !profile.data) {
    return (
      <ErrorState
        title="We could not load your account"
        message={profile.error ? describeError(profile.error, "read").message : "Check your connection and try again."}
        actionLabel="Try again"
        onAction={() => void profile.refetch()}
      />
    );
  }
  const person = profile.data;
  const name = person.display_name || person.full_name || "Your details";

  const memberSince = person.date_joined
    ? `With V Solve Hub since ${new Date(person.date_joined).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })}`
    : null;

  const openEditDialog = () => {
    setEditName(person.full_name || "");
    setEditDisplay(person.display_name || "");
    setEditEmail(person.email || "");
    setIsEditing(true);
  };

  return (
    <ScrollView className="flex-1 bg-[#FAF9F7]" contentContainerClassName="gap-4 px-4 pb-20 pt-5">
      {/* Top Header matching previous customer portal */}
      <View className="flex-row items-start justify-between gap-3">
        <Text className="min-w-0 text-[1.875rem] font-extrabold leading-[1.15] tracking-tight text-navy-900">
          Your profile
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Notifications"
          onPress={() => requestOpenNotifications()}
          className="-mr-1.5 -mt-0.5 h-10 w-10 items-center justify-center rounded-full active:bg-surface-hover"
        >
          <Svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="#071328" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <Path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </Svg>
        </Pressable>
      </View>

      <Text className="text-[15px] leading-relaxed text-text-secondary">
        Manage your details, communication preferences, and signed-in devices.
      </Text>

      {/* Account Navigation Pills */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 py-0.5">
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: true }}
          className="min-h-11 flex-row items-center gap-1.5 rounded-full border border-[#EA580C] bg-[#EA580C] px-3.5"
        >
          <Svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="#FFFFFF" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
            <Circle cx={12} cy={7} r={4} />
          </Svg>
          <Text className="text-sm font-bold text-white">Profile</Text>
        </Pressable>

        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: false }}
          onPress={() => router.push("/account/addresses")}
          className="min-h-11 flex-row items-center gap-1.5 rounded-full border border-[#e7e2da] bg-white px-3.5"
        >
          <Svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="#071328" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
            <Circle cx={12} cy={10} r={3} />
          </Svg>
          <Text className="text-sm font-semibold text-navy-900">Addresses</Text>
        </Pressable>

        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: false }}
          onPress={() => router.push("/account/messages")}
          className="min-h-11 flex-row items-center gap-1.5 rounded-full border border-[#e7e2da] bg-white px-3.5"
        >
          <Svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="#071328" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
          </Svg>
          <Text className="text-sm font-semibold text-navy-900">Messages</Text>
        </Pressable>

        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: false }}
          onPress={() => router.push("/account/privacy")}
          className="min-h-11 flex-row items-center gap-1.5 rounded-full border border-[#e7e2da] bg-white px-3.5"
        >
          <Svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="#071328" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </Svg>
          <Text className="text-sm font-semibold text-navy-900">Privacy</Text>
        </Pressable>

        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: false }}
          onPress={() => router.push("/account/sessions")}
          className="min-h-11 flex-row items-center gap-1.5 rounded-full border border-[#e7e2da] bg-white px-3.5"
        >
          <Svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="#071328" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round">
            <Rect width={14} height={20} x={5} y={2} rx={2} ry={2} />
            <Path d="M12 18h.01" />
          </Svg>
          <Text className="text-sm font-semibold text-navy-900">Devices</Text>
        </Pressable>
      </ScrollView>

      {/* Main Profile Card Container */}
      <View className="overflow-hidden rounded-[1.25rem] border border-[#e7e2da]/80 bg-white shadow-xs">
        {/* Navy Header Banner with subtle dot matrix */}
        <View className="relative items-center gap-3 overflow-hidden bg-[#041227] px-6 py-8">
          <Svg
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
            width="100%"
            height="100%"
            pointerEvents="none"
          >
            <Defs>
              <Pattern id="profile-dots" width={20} height={20} patternUnits="userSpaceOnUse">
                <Circle cx={2} cy={2} r={1} fill="#ffffff" fillOpacity={0.18} />
              </Pattern>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#profile-dots)" />
          </Svg>

          <View className="z-10 size-20 items-center justify-center rounded-full bg-white shadow-md">
            <Text className="text-3xl font-bold text-navy-900">{initials(name)}</Text>
          </View>
          <Text className="z-10 text-[10px] font-bold uppercase tracking-[0.15em] text-[#8EA2C6]">
            Personal profile
          </Text>
          <Text className="z-10 text-center text-xl font-bold leading-tight text-white">{name}</Text>
          {memberSince ? (
            <Text className="z-10 text-xs text-[#A9B9D1]">{memberSince}</Text>
          ) : null}
        </View>

        {/* 4 Profile Field Box Cards */}
        <View className="gap-3 p-4">
          <ProfileFieldCard
            icon="person"
            label="DISPLAY NAME"
            value={person.display_name}
          />
          <ProfileFieldCard
            icon="badge"
            label="FULL NAME"
            value={person.full_name}
          />
          <ProfileFieldCard
            icon="phone"
            label="MOBILE NUMBER"
            value={person.phone_number}
          />
          <ProfileFieldCard
            icon="mail"
            label="EMAIL"
            value={person.email}
          />
        </View>

        {/* Card Footer with Security info and buttons */}
        <View className="gap-4 border-t border-line bg-[#FAF9F7] px-4 py-4">
          <View className="flex-row items-start gap-2">
            <Svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="#071328" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
              <Path d="M12 15v2m-6 4h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2zm10-10V7a4 4 0 0 0-8 0v4h8z" />
            </Svg>
            <Text className="flex-1 text-[0.8125rem] leading-relaxed text-text-secondary">
              Your mobile number is also your secure sign-in ID.
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={openEditDialog}
            className="h-11 w-full items-center justify-center rounded-xl border border-line bg-white active:bg-[#F5F3EF]"
          >
            <Text className="text-[0.875rem] font-semibold text-navy-900">Edit profile</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => void signOut()}
            className="h-10 w-full items-center justify-center active:opacity-70"
          >
            <Text className="text-sm font-bold text-[#0B1B3D]">Sign out</Text>
          </Pressable>
        </View>
      </View>

      {/* Support & Legal Section */}
      <View className="overflow-hidden rounded-[1.25rem] border border-[#e7e2da]/80 bg-white shadow-xs">
        <View className="border-b border-line/60 bg-[#FAF9F7] px-4 py-3">
          <Text className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
            Support & Legal
          </Text>
        </View>
        <View className="divide-y divide-line/60">
          <Pressable
            accessibilityRole="button"
            onPress={() => void WebBrowser.openBrowserAsync(`${WEB_BASE}/terms`)}
            className="flex-row items-center justify-between p-4 active:bg-surface-sunken"
          >
            <View className="flex-row items-center gap-3">
              <View className="size-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50">
                <Svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="#475569" strokeWidth={1.8}>
                  <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <Path d="M14 2v6h6" />
                  <Path d="M16 13H8" />
                  <Path d="M16 17H8" />
                  <Path d="M10 9H8" />
                </Svg>
              </View>
              <View>
                <Text className="text-sm font-bold text-navy-900">Terms of Service</Text>
                <Text className="text-xs text-text-muted">Customer service agreement</Text>
              </View>
            </View>
            <Svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="#6B6560" strokeWidth={2}>
              <Path d="m9 18 6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => void WebBrowser.openBrowserAsync(`${WEB_BASE}/privacy`)}
            className="flex-row items-center justify-between p-4 active:bg-surface-sunken"
          >
            <View className="flex-row items-center gap-3">
              <View className="size-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50">
                <Svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="#475569" strokeWidth={1.8}>
                  <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </Svg>
              </View>
              <View>
                <Text className="text-sm font-bold text-navy-900">Privacy Policy</Text>
                <Text className="text-xs text-text-muted">How we handle your data</Text>
              </View>
            </View>
            <Svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="#6B6560" strokeWidth={2}>
              <Path d="m9 18 6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => void WebBrowser.openBrowserAsync(`${WEB_BASE}/contact`)}
            className="flex-row items-center justify-between p-4 active:bg-surface-sunken"
          >
            <View className="flex-row items-center gap-3">
              <View className="size-9 items-center justify-center rounded-xl border border-teal-100 bg-teal-50">
                <Svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="#0D9488" strokeWidth={1.8}>
                  <Path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </Svg>
              </View>
              <View>
                <Text className="text-sm font-bold text-navy-900">Contact Us</Text>
                <Text className="text-xs text-text-muted">Customer help & support</Text>
              </View>
            </View>
            <Svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="#6B6560" strokeWidth={2}>
              <Path d="m9 18 6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/account/privacy")}
            className="flex-row items-center justify-between p-4 active:bg-surface-sunken"
          >
            <View className="flex-row items-center gap-3">
              <View className="size-9 items-center justify-center rounded-xl border border-red-100 bg-red-50">
                <Svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="#DC2626" strokeWidth={1.8}>
                  <Path d="M3 6h18" />
                  <Path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                  <Path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </Svg>
              </View>
              <View>
                <Text className="text-sm font-bold text-red-600">Delete my account</Text>
                <Text className="text-xs text-text-muted">Ask us to erase your personal data</Text>
              </View>
            </View>
            <Svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="#6B6560" strokeWidth={2}>
              <Path d="m9 18 6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </Pressable>
        </View>
      </View>

      {/* Edit Profile Dialog Modal */}
      <Dialog
        open={isEditing}
        onOpenChange={setIsEditing}
        title="Edit profile"
        description="Update the details attached to your bookings."
      >
        <View className="gap-3 py-2">
          <Input
            value={editDisplay}
            onChangeText={setEditDisplay}
            placeholder="Display name"
          />
          <Input
            value={editName}
            onChangeText={setEditName}
            placeholder="Full name"
          />
          <Input
            value={editEmail}
            onChangeText={setEditEmail}
            placeholder="Email"
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Text className="text-xs text-text-secondary">Mobile: {person.phone_number}</Text>
          {update.error ? (
            <Text className="text-xs text-danger-text">{describeError(update.error, "mutation").message}</Text>
          ) : null}
          <View className="mt-2 flex-row justify-end gap-2">
            <Pressable
              onPress={() => setIsEditing(false)}
              className="h-10 items-center justify-center rounded-xl px-4"
            >
              <Text className="text-sm font-semibold text-text-secondary">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                update.mutate(
                  {
                    display_name: editDisplay,
                    full_name: editName,
                    email: editEmail,
                  },
                  {
                    onSuccess: () => setIsEditing(false),
                  }
                );
              }}
              disabled={update.isPending}
              className="h-10 items-center justify-center rounded-xl bg-[#EA580C] px-5 active:bg-[#C2410C]"
            >
              <Text className="text-sm font-bold text-white">
                {update.isPending ? "Saving…" : "Save changes"}
              </Text>
            </Pressable>
          </View>
        </View>
      </Dialog>
    </ScrollView>
  );
}

function initials(name: string): string {
  const parts = name.split(" ").filter((part) => part.length > 0);
  return (parts[0]?.[0] ?? "V").toUpperCase();
}

function ProfileFieldCard({
  icon,
  label,
  value,
}: {
  icon: "person" | "badge" | "phone" | "mail";
  label: string;
  value: string | null | undefined;
}) {
  const displayValue = value && value.trim().length > 0 ? value : "Not added";

  return (
    <View className="flex-row items-center gap-4 rounded-2xl border border-[#e7e2da]/70 bg-[#FAF9F7] px-4 py-4">
      {/* Peach circular glyph */}
      <View className="size-11 shrink-0 items-center justify-center rounded-full bg-[#FCEFDF]">
        {icon === "person" ? (
          <Svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="#D85C3A" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0" />
          </Svg>
        ) : null}
        {icon === "badge" ? (
          <Svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="#D85C3A" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M8 4h8l3 4-7 12L5 8l3-4Zm-3 4h14M9 4l3 4 3-4" />
          </Svg>
        ) : null}
        {icon === "phone" ? (
          <Svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="#D85C3A" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M6 4h3l2 5-2 1.5a14 14 0 0 0 4.5 4.5L15 13l5 2v3a2 2 0 0 1-2 2C10.27 20 4 13.73 4 6a2 2 0 0 1 2-2Z" />
          </Svg>
        ) : null}
        {icon === "mail" ? (
          <Svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="#D85C3A" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M3 6h18v12H3V6Zm0 1 9 7 9-7" />
          </Svg>
        ) : null}
      </View>

      <View className="min-w-0 flex-1">
        <Text className="text-[0.6875rem] font-bold uppercase tracking-wider text-text-secondary">
          {label}
        </Text>
        <Text className="mt-0.5 text-base font-bold text-navy-900" numberOfLines={1}>
          {displayValue}
        </Text>
      </View>
    </View>
  );
}
