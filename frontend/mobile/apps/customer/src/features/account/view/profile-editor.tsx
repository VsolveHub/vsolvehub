// Ported from frontend/apps/customer/features/account/view/profile-editor.tsx
import { describeError } from "@vsolve/query/native";
import { Button, ErrorState, Input, Spinner, Text } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useCustomerProfile, useUpdateCustomerProfile } from "@/features/account/queries";
import { useIsDesktop } from "@/lib/responsive";
import { DesktopAccountNav } from "./desktop-account-nav";
import { DesktopSiteFooter } from "@/features/session/view/desktop-site-footer";

export function ProfileEditor({
  embedded = false,
  onDone,
}: {
  embedded?: boolean;
  onDone?: () => void;
} = {}) {
  const router = useRouter();
  const isDesktop = useIsDesktop();
  const insets = useSafeAreaInsets();
  const profile = useCustomerProfile();
  const update = useUpdateCustomerProfile();
  const [fullName, setFullName] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await profile.refetch();
    setRefreshing(false);
  };

  if (profile.isPending) {
    return (
      <View className="flex-1 items-center justify-center">
        <Spinner size="sm" />
      </View>
    );
  }
  if (profile.isError || !profile.data) {
    return (
      <View className="flex-1 bg-canvas px-4 py-6">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to Profile"
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.push("/account");
            }
          }}
          className="mb-4 size-9 items-center justify-center rounded-full border border-line bg-surface shadow-2xs active:bg-surface-hover"
        >
          <ChevronLeft size={18} color="#00112e" />
        </Pressable>
        <ErrorState
          title="We could not load your profile"
          message="Check your connection and try again."
          actionLabel="Try again"
          onAction={() => void profile.refetch()}
        />
      </View>
    );
  }
  const person = profile.data;

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
              Edit profile
            </Text>
            <Text className="mt-2 text-[1.05rem] leading-relaxed text-[#64748B]">
              Update your personal details.
            </Text>
          </View>

          {/* Two-column layout */}
          <View className="mt-8 flex-row items-start gap-10 lg:gap-12">
            <DesktopAccountNav activeKey="profile" />

            <View className="min-w-0 flex-1 max-w-xl rounded-2xl border border-[#F1EFEB] bg-white p-6 shadow-xs gap-4">
              {onDone && (
                <View className="flex-row items-center justify-between pb-2 border-b border-[#F4F2EE]">
                  <View>
                    <Text className="text-lg font-bold text-[#0B1B3D]">Edit personal details</Text>
                    <Text className="text-xs text-[#64748B]">These details appear on your invoices and messages.</Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    onPress={onDone}
                    className="size-8 items-center justify-center rounded-full border border-[#E5E7EB] bg-white shadow-2xs active:bg-[#F2EFE9]"
                  >
                    <ChevronLeft size={16} color="#0F172A" />
                  </Pressable>
                </View>
              )}
              <View>
                <Text className="mb-1 text-xs font-semibold uppercase tracking-wider text-[#64748B]">Full Name</Text>
                <Input value={fullName ?? person.full_name ?? ""} onChangeText={setFullName} placeholder="Full name" />
              </View>
              <View>
                <Text className="mb-1 text-xs font-semibold uppercase tracking-wider text-[#64748B]">Display Name</Text>
                <Input value={displayName ?? person.display_name ?? ""} onChangeText={setDisplayName} placeholder="Display name" />
              </View>
              <View>
                <Text className="mb-1 text-xs font-semibold uppercase tracking-wider text-[#64748B]">Email Address</Text>
                <Input value={email ?? person.email ?? ""} onChangeText={setEmail} placeholder="Email" keyboardType="email-address" autoCapitalize="none" />
              </View>

              <View className="rounded-xl bg-[#FAF9F7] p-3 border border-[#EAE8E4]">
                <Text className="text-xs font-semibold text-[#0F172A]">Mobile Number (Sign-in ID)</Text>
                <Text className="text-sm font-bold text-[#64748B] mt-0.5">{person.phone_number}</Text>
                <Text className="text-[11px] text-[#94A3B8] mt-0.5">Primary verified phone number cannot be changed here.</Text>
              </View>

              {savedSuccess ? (
                <View className="rounded-xl bg-emerald-50 border border-emerald-200 p-2.5">
                  <Text className="text-xs font-semibold text-emerald-800">Profile saved successfully! ✓</Text>
                </View>
              ) : null}

              {update.error ? <Text className="text-sm text-danger-text">{describeError(update.error, "mutation").message}</Text> : null}

              <Button
                loading={update.isPending}
                loadingLabel="Saving changes…"
                className="mt-2 bg-[#EA580C]"
                onPress={() => {
                  setSavedSuccess(false);
                  update.mutate(
                    {
                      full_name: fullName ?? person.full_name,
                      display_name: displayName ?? person.display_name,
                      email: email ?? person.email,
                    },
                    {
                      onSuccess: () => {
                        setSavedSuccess(true);
                        setTimeout(() => {
                          setSavedSuccess(false);
                          if (onDone) onDone();
                        }, 1200);
                      },
                    }
                  );
                }}
              >
                Save changes
              </Button>
            </View>
          </View>
        </View>

        <DesktopSiteFooter />
      </ScrollView>
    );
  }

  if (embedded) {
    return (
      <View className="min-w-0 flex-1 max-w-xl rounded-2xl border border-[#F1EFEB] bg-white p-6 shadow-xs gap-4">
        {onDone && (
          <View className="flex-row items-center justify-between pb-2 border-b border-[#F4F2EE]">
            <View>
              <Text className="text-lg font-bold text-[#0B1B3D]">Edit personal details</Text>
              <Text className="text-xs text-[#64748B]">These details appear on your invoices and messages.</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={onDone}
              className="size-8 items-center justify-center rounded-full border border-[#E5E7EB] bg-white shadow-2xs active:bg-[#F2EFE9]"
            >
              <ChevronLeft size={16} color="#0F172A" />
            </Pressable>
          </View>
        )}
        <View>
          <Text className="mb-1 text-xs font-semibold uppercase tracking-wider text-[#64748B]">Full Name</Text>
          <Input value={fullName ?? person.full_name ?? ""} onChangeText={setFullName} placeholder="Full name" />
        </View>
        <View>
          <Text className="mb-1 text-xs font-semibold uppercase tracking-wider text-[#64748B]">Display Name</Text>
          <Input value={displayName ?? person.display_name ?? ""} onChangeText={setDisplayName} placeholder="Display name" />
        </View>
        <View>
          <Text className="mb-1 text-xs font-semibold uppercase tracking-wider text-[#64748B]">Email Address</Text>
          <Input value={email ?? person.email ?? ""} onChangeText={setEmail} placeholder="Email" keyboardType="email-address" autoCapitalize="none" />
        </View>

        <View className="rounded-xl bg-[#FAF9F7] p-3 border border-[#EAE8E4]">
          <Text className="text-xs font-semibold text-[#0F172A]">Mobile Number (Sign-in ID)</Text>
          <Text className="text-sm font-bold text-[#64748B] mt-0.5">{person.phone_number}</Text>
          <Text className="text-[11px] text-[#94A3B8] mt-0.5">Primary verified phone number cannot be changed here.</Text>
        </View>

        {savedSuccess ? (
          <View className="rounded-xl bg-emerald-50 border border-emerald-200 p-2.5">
            <Text className="text-xs font-semibold text-emerald-800">Profile saved successfully! ✓</Text>
          </View>
        ) : null}

        {update.error ? <Text className="text-sm text-danger-text">{describeError(update.error, "mutation").message}</Text> : null}

        <Button
          loading={update.isPending}
          loadingLabel="Saving changes…"
          className="mt-2 bg-[#EA580C]"
          onPress={() => {
            setSavedSuccess(false);
            update.mutate(
              {
                full_name: fullName ?? person.full_name,
                display_name: displayName ?? person.display_name,
                email: email ?? person.email,
              },
              {
                onSuccess: () => {
                  setSavedSuccess(true);
                  setTimeout(() => {
                    setSavedSuccess(false);
                    if (onDone) onDone();
                  }, 1200);
                },
              }
            );
          }}
        >
          Save changes
        </Button>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-[#FAF9F7]"
      style={{ paddingTop: Math.max(insets.top, 20) }}
      contentContainerClassName="gap-4 px-4 pb-24 pt-2"
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#EA580C"]} tintColor="#EA580C" />
      }
    >
      <View className="flex-row items-center gap-3 py-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to Profile"
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.push("/account");
            }
          }}
          className="size-9 items-center justify-center rounded-full border border-[#E5E7EB] bg-white shadow-2xs active:bg-[#F2EFE9]"
        >
          <ChevronLeft size={20} color="#0F172A" />
        </Pressable>
        <View className="flex-1 min-w-0">
          <Text className="text-2xl font-extrabold text-[#0B1B3D]">Edit profile</Text>
          <Text className="text-xs text-[#64748B]">Update personal details</Text>
        </View>
      </View>

      <View className="rounded-2xl border border-[#F1EFEB] bg-white p-5 shadow-xs gap-3.5">
        <View>
          <Text className="mb-1 text-xs font-semibold uppercase tracking-wider text-[#64748B]">Full Name</Text>
          <Input value={fullName ?? person.full_name ?? ""} onChangeText={setFullName} placeholder="Full name" />
        </View>
        <View>
          <Text className="mb-1 text-xs font-semibold uppercase tracking-wider text-[#64748B]">Display Name</Text>
          <Input value={displayName ?? person.display_name ?? ""} onChangeText={setDisplayName} placeholder="Display name" />
        </View>
        <View>
          <Text className="mb-1 text-xs font-semibold uppercase tracking-wider text-[#64748B]">Email Address</Text>
          <Input value={email ?? person.email ?? ""} onChangeText={setEmail} placeholder="Email" keyboardType="email-address" autoCapitalize="none" />
        </View>

        <View className="rounded-xl bg-[#FAF9F7] p-3 border border-[#EAE8E4]">
          <Text className="text-xs font-semibold text-[#0F172A]">Mobile Number (Sign-in ID)</Text>
          <Text className="text-sm font-bold text-[#64748B] mt-0.5">{person.phone_number}</Text>
          <Text className="text-[11px] text-[#94A3B8] mt-0.5">Primary verified phone number cannot be changed here.</Text>
        </View>

        {savedSuccess ? (
          <View className="rounded-xl bg-emerald-50 border border-emerald-200 p-2.5">
            <Text className="text-xs font-semibold text-emerald-800">Profile saved successfully! ✓</Text>
          </View>
        ) : null}

        {update.error ? <Text className="text-sm text-danger-text">{describeError(update.error, "mutation").message}</Text> : null}

        <Button
          loading={update.isPending}
          loadingLabel="Saving changes…"
          className="mt-2 bg-[#EA580C]"
          onPress={() => {
            setSavedSuccess(false);
            update.mutate(
              {
                full_name: fullName ?? person.full_name,
                display_name: displayName ?? person.display_name,
                email: email ?? person.email,
              },
              {
                onSuccess: () => {
                  setSavedSuccess(true);
                  setTimeout(() => setSavedSuccess(false), 3000);
                },
              }
            );
          }}
        >
          Save changes
        </Button>
      </View>
    </ScrollView>
  );
}
