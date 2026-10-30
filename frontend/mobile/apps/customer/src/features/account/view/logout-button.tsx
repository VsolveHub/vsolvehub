import { useMobileLogout } from "@vsolve/mobile-core";
import { Dialog, Text } from "@vsolve/mobile-ui";
import { useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import Svg, { Path } from "react-native-svg";

export interface LogoutButtonProps {
  className?: string;
  onLogoutSuccess?: () => void;
  variant?: "default" | "ghost";
}

export function LogoutButton({ className = "", onLogoutSuccess, variant = "default" }: LogoutButtonProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const signOut = useMobileLogout();

  const handleLogout = async () => {
    try {
      setPending(true);
      await signOut();
      setOpen(false);
      onLogoutSuccess?.();
    } finally {
      setPending(false);
    }
  };

  return (
    <View className={variant === "ghost" ? className : `w-full ${className}`}>
      {variant === "ghost" ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sign out of your account"
          accessibilityHint="Opens a confirmation dialog to log out"
          onPress={() => setOpen(true)}
          className="rounded-lg px-3 py-1.5 active:bg-red-50 hover:bg-red-50"
        >
          <Text className="text-sm font-semibold text-[#D32F2F]">Sign out</Text>
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sign out of your account"
          accessibilityHint="Opens a confirmation dialog to log out"
          onPress={() => setOpen(true)}
          className="h-11 w-full flex-row items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50/70 active:bg-red-100/70"
        >
          <Svg
            viewBox="0 0 24 24"
            width={18}
            height={18}
            fill="none"
            stroke="#DC2626"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <Path d="M16 17l5-5-5-5" />
            <Path d="M21 12H9" />
          </Svg>
          <Text className="text-sm font-bold text-red-600">Sign out</Text>
        </Pressable>
      )}

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!pending) setOpen(next);
        }}
        title="Sign out of V Solve Hub?"
        description="You will need to sign in again with your mobile number to access your bookings and saved addresses."
        footer={
          <View className="flex-row items-center justify-end gap-3 pt-1">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel sign out"
              disabled={pending}
              onPress={() => setOpen(false)}
              className="h-11 items-center justify-center rounded-xl border border-line px-5 active:bg-surface-sunken"
            >
              <Text className="text-sm font-semibold text-navy-900">Cancel</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Confirm sign out"
              disabled={pending}
              onPress={() => void handleLogout()}
              className="h-11 flex-row items-center justify-center gap-2 rounded-xl bg-red-600 px-5 active:bg-red-700"
            >
              {pending ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : null}
              <Text className="text-sm font-bold text-white">
                {pending ? "Signing out…" : "Sign out"}
              </Text>
            </Pressable>
          </View>
        }
      />
    </View>
  );
}
