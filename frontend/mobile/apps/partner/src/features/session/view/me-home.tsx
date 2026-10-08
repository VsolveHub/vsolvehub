// Ported from frontend/apps/partner/features/session/view/me-home.tsx
import { hasWorkspaceAction } from "@vsolve/query/native";
import { Button, Text, cn } from "@vsolve/mobile-ui";
import { useMobileLogout } from "@vsolve/mobile-core";
import * as WebBrowser from "expo-web-browser";
import { useRouter } from "expo-router";
import {
  Briefcase,
  ChevronRight,
  FolderKanban,
  Globe,
  HardHat,
  Phone,
  Power,
  ShieldCheck,
  User,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { Linking, Pressable, ScrollView, View } from "react-native";

import { usePartnerProfile } from "@/features/profile/queries";
import { PartnerPresence } from "@/features/presence/view/partner-presence";
import { WORKFORCE_WORKSPACE } from "@/features/workspace/registry";
import { usePartnerWorkspaceGrants } from "@/features/workspace/queries";

const WEB_BASE = process.env.EXPO_PUBLIC_WEB_BASE_URL ?? "https://partner.vsolvehub.com";

export function MeHome() {
  const router = useRouter();
  const logout = useMobileLogout();
  const [signingOut, setSigningOut] = useState(false);
  const grants = usePartnerWorkspaceGrants();
  const canManageCrew = hasWorkspaceAction(grants.grants ?? [], WORKFORCE_WORKSPACE, "crew.manage");

  return (
    <ScrollView className="flex-1 bg-canvas" contentContainerClassName="gap-4 pb-8">
      {/* Clean Professional Profile Card */}
      <IdentityCard />

      {/* Live Availability Toggle Card */}
      <View className="px-4">
        <PartnerPresence />
      </View>

      {/* Account & Profile Section */}
      <Section title="Account & Profile">
        <SettingsRow
          icon={User}
          title="Personal Profile"
          subtitle="Contact details, craft & KYC documents"
          boxBg="bg-blue-50"
          boxBorder="border-blue-100"
          iconColor="#00246b"
          onPress={() => router.push("/me/profile")}
        />
        <SettingsRow
          icon={Globe}
          title="App Language"
          subtitle="English (India)"
          boxBg="bg-purple-50"
          boxBorder="border-purple-100"
          iconColor="#6b21a8"
          onPress={() => router.push("/me/language")}
        />
        <SettingsRow
          icon={User}
          title="Delete account"
          subtitle="Ask us to erase data we are not required to keep"
          boxBg="bg-red-50"
          boxBorder="border-red-100"
          iconColor="#b3261e"
          onPress={() => router.push("/me/delete-account")}
        />
      </Section>

      {/* Work & Financials Section */}
      <Section title="Work & Financials">
        <SettingsRow
          icon={Wallet}
          title="Money & Earnings"
          subtitle="Daily earnings, passbook & settlements"
          boxBg="bg-emerald-50"
          boxBorder="border-emerald-100"
          iconColor="#0e7c3a"
          onPress={() => router.push("/money")}
        />
        <SettingsRow
          icon={Wallet}
          title="Rate card"
          subtitle="The prices you publish"
          boxBg="bg-blue-50"
          boxBorder="border-blue-100"
          iconColor="#00246b"
          onPress={() => router.push("/me/rate-card")}
        />
        {canManageCrew ? (
          <SettingsRow
            icon={Users}
            title="Contractor Crew"
            subtitle="Manage team roster & crew dispatch"
            boxBg="bg-amber-50"
            boxBorder="border-amber-100"
            iconColor="#f87000"
            onPress={() => router.push("/me/crew")}
          />
        ) : null}
      </Section>

      {/* Specialty Workspaces Section */}
      <Section title="Specialty Workspaces">
        <SettingsRow
          icon={HardHat}
          title="Rental Equipment Workspace"
          subtitle="Manage rental inventory, tools & orders"
          boxBg="bg-amber-50"
          boxBorder="border-amber-100"
          iconColor="#d97706"
          onPress={() => router.push("/rentals")}
        />
        <SettingsRow
          icon={FolderKanban}
          title="Stay & PG Hosting"
          subtitle="Host hostel/PG rooms, manage leads & visits"
          boxBg="bg-blue-50"
          boxBorder="border-blue-100"
          iconColor="#2563eb"
          onPress={() => router.push("/stays")}
        />
        <SettingsRow
          icon={Briefcase}
          title="Hiring & Job Postings"
          subtitle="Post job openings, review candidate pipeline"
          boxBg="bg-indigo-50"
          boxBorder="border-indigo-100"
          iconColor="#4f46e5"
          onPress={() => router.push("/listings")}
        />
      </Section>

      {/* Support & Safety Section */}
      <Section title="Support & Safety">
        <SettingsRow
          icon={Phone}
          title="24/7 Partner Helpline"
          subtitle="+91 (800) 876-5832 • Dedicated Assistance"
          boxBg="bg-teal-50"
          boxBorder="border-teal-100"
          iconColor="#0D9488"
          onPress={() => void Linking.openURL("tel:+918008765832")}
        />
        <SettingsRow
          icon={Globe}
          title="Terms"
          subtitle="Opens on the website"
          boxBg="bg-slate-50"
          boxBorder="border-slate-150"
          iconColor="#64748B"
          onPress={() => void WebBrowser.openBrowserAsync(`${WEB_BASE}/terms`)}
        />
        <SettingsRow
          icon={ShieldCheck}
          title="Privacy"
          subtitle="Opens on the website"
          boxBg="bg-slate-50"
          boxBorder="border-slate-150"
          iconColor="#64748B"
          onPress={() => void WebBrowser.openBrowserAsync(`${WEB_BASE}/privacy`)}
        />
      </Section>

      {/* Sign Out Action Button */}
      <View className="px-4 pt-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sign Out"
          disabled={signingOut}
          onPress={() => {
            setSigningOut(true);
            void logout().finally(() => setSigningOut(false));
          }}
          className="h-12 w-full flex-row items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50/60 active:bg-red-100/60"
        >
          <Power size={18} color="#DC2626" strokeWidth={2.4} />
          <Text className="text-sm font-bold text-red-700">
            {signingOut ? "Signing out…" : "Sign Out"}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function IdentityCard() {
  const profile = usePartnerProfile();
  const trade = profile.data?.skills[0] ?? null;
  const displayName = profile.data?.display_name ?? "Partner";
  const initial = displayName.charAt(0).toUpperCase() || "P";

  return (
    <View className="mx-4 mt-3 rounded-2xl border border-line bg-surface p-4 shadow-xs">
      <View className="flex-row items-center justify-between gap-3">
        <View className="min-w-0 flex-1 flex-row items-center gap-3.5">
          {/* Subtle clean avatar with online emerald dot */}
          <View className="relative shrink-0">
            <View className="size-12 items-center justify-center rounded-full bg-navy-900 shadow-xs">
              <Text className="text-base font-bold text-white">{initial}</Text>
            </View>
            <View className="absolute bottom-0 right-0 size-3.5 rounded-full border-2 border-surface bg-emerald-500" />
          </View>

          {/* Name & Details */}
          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className="text-base font-bold text-navy-900">
              {displayName}
            </Text>
            <Text numberOfLines={1} className="mt-0.5 text-xs text-text-secondary">
              {profile.data?.phone_number ?? "—"}
            </Text>
            {trade ? (
              <View className="mt-1.5 self-start rounded-md border border-line bg-surface-sunken px-2 py-0.5">
                <Text className="text-[11px] font-medium text-navy-800">{trade}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Verified Status Pill */}
        <View className="shrink-0 self-start">
          <View className="flex-row items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1">
            <ShieldCheck size={12} color="#059669" />
            <Text className="text-[11px] font-bold text-emerald-700">Verified</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-1.5 px-4">
      <Text className="px-1 text-[11px] font-bold uppercase tracking-wider text-text-muted">{title}</Text>
      <View className="overflow-hidden rounded-2xl border border-line bg-surface divide-y divide-line/60">
        {children}
      </View>
    </View>
  );
}

function SettingsRow({
  icon: Icon,
  title,
  subtitle,
  boxBg,
  boxBorder,
  iconColor,
  onPress,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  boxBg: string;
  boxBorder: string;
  iconColor: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="flex-row items-center justify-between p-3.5 active:bg-surface-sunken"
    >
      <View className="min-w-0 flex-1 flex-row items-center gap-3.5">
        <View className={cn("size-10 shrink-0 items-center justify-center rounded-xl border", boxBg, boxBorder)}>
          <Icon size={20} color={iconColor} strokeWidth={2.2} />
        </View>
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="text-sm font-bold text-navy-900 leading-tight">
            {title}
          </Text>
          <Text numberOfLines={1} className="mt-0.5 text-xs text-text-secondary">
            {subtitle}
          </Text>
        </View>
      </View>
      <ChevronRight size={18} color="#94A3B8" className="shrink-0" />
    </Pressable>
  );
}
