// Ported from frontend/apps/customer/features/session/view/customer-login-experience.tsx
import type { MobileOtpFlow } from "@vsolve/mobile-core";
import { ErrorState, Logo, Text, cn, formatDuration } from "@vsolve/mobile-ui";
import { useEffect, useRef, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  TextInput,
  View,
} from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

function ShieldIcon({ size = 20, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path
        d="M10 2.5 4 5v5c0 3.5 2.6 6.8 6 7.5 3.4-.7 6-4 6-7.5V5l-6-2.5Z"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <Path
        d="m7.5 10 1.75 1.75L12.5 8.5"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function MessageIcon({ size = 20, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path
        d="M4 5.5A2.5 2.5 0 0 1 6.5 3h7A2.5 2.5 0 0 1 16 5.5v5A2.5 2.5 0 0 1 13.5 13H8l-3.5 2.5V13H6.5A2.5 2.5 0 0 1 4 10.5v-5Z"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function UserIcon({ size = 20, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Circle cx={10} cy={7} r={2.75} stroke={color} strokeWidth={1.5} />
      <Path
        d="M5 16.5c.8-2.4 2.6-3.75 5-3.75s4.2 1.35 5 3.75"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function ChevronDownIcon({ size = 12, color = "#64748B" }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 12 12" fill="none">
      <Path
        d="m3 4.5 3 3 3-3"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function ShieldOutlineIcon({ size = 14, color = "#64748B" }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path
        d="M10 2.5 4 5v5c0 3.5 2.6 6.8 6 7.5 3.4-.7 6-4 6-7.5V5l-6-2.5Z"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <Path
        d="m7.5 10 1.75 1.75L12.5 8.5"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function LoginBenefits() {
  const items = [
    { icon: ShieldIcon, label: "Secure & Safe" },
    { icon: MessageIcon, label: "OTP via SMS" },
    { icon: UserIcon, label: "No Password Required" },
  ] as const;

  return (
    <View className="gap-3.5">
      {items.map(({ icon: Icon, label }) => (
        <View key={label} className="flex-row items-center gap-3.5">
          <View className="h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FFF5EB]">
            <Icon size={18} color="#EA580C" />
          </View>
          <Text className="text-[13px] font-bold text-navy-900">{label}</Text>
        </View>
      ))}
    </View>
  );
}

function LoginPhoneField({
  phone,
  onPhoneChange,
  phoneError,
  codeLength,
}: {
  phone: string;
  onPhoneChange: (value: string) => void;
  phoneError?: string | null;
  codeLength: number;
}) {
  return (
    <View className="gap-1.5">
      <View className="flex-row items-center">
        <Text className="text-[14px] font-bold text-navy-900">Mobile number</Text>
        <Text className="ml-1 text-[14px] font-bold text-[#EF4444]">*</Text>
      </View>
      <Text className="text-[13px] text-text-secondary">
        We will send a {codeLength}-digit code by SMS.
      </Text>
      <View
        className={cn(
          "mt-1 min-h-12 flex-row items-stretch overflow-hidden rounded-xl border bg-white",
          phoneError ? "border-danger" : "border-[#E2E8F0]",
        )}
      >
        <View className="flex-row items-center gap-1.5 border-r border-[#E2E8F0] bg-[#F1ECE5]/60 px-3.5">
          <Text className="text-[13px] font-extrabold text-navy-900">IN</Text>
          <Text className="text-[14px] font-bold text-navy-900">+91</Text>
          <ChevronDownIcon size={12} color="#64748B" />
        </View>
        <TextInput
          accessibilityLabel="Mobile number"
          keyboardType="number-pad"
          maxLength={10}
          placeholder="9876543210"
          placeholderTextColor="#94A3B8"
          value={phone}
          onChangeText={onPhoneChange}
          className="flex-1 px-3.5 py-2.5 text-[15px] font-semibold text-navy-900"
          style={{ outlineStyle: "none" } as never}
        />
      </View>
      {phoneError ? (
        <Text className="mt-1 text-xs font-medium text-danger">{phoneError}</Text>
      ) : null}
    </View>
  );
}

export function CustomerLoginForm({
  flow,
  verifyLabel = "Verify and continue",
}: {
  flow: MobileOtpFlow;
  verifyLabel?: string;
}) {
  const codeInputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (flow.phase === "code") {
      codeInputRef.current?.focus();
    }
  }, [flow.phase]);

  return (
    <View className="flex-col">
      {flow.failure ? (
        <ErrorState
          inline
          className="mb-4"
          title={flow.failure.title}
          message={flow.failure.message}
          severity={flow.failure.severity}
          reference={flow.failure.reference}
        />
      ) : null}

      {flow.phase === "authenticated" ? (
        <View className="py-2">
          <Text className="text-sm text-text-secondary">Logged in as</Text>
          <Text className="text-base font-semibold text-navy-900">{flow.phone}</Text>
          <Pressable
            onPress={flow.reset}
            className="mt-3 self-start rounded-xl border border-line bg-white px-4 py-2"
          >
            <Text className="text-sm font-semibold text-navy-900">Use a different number</Text>
          </Pressable>
        </View>
      ) : null}

      {flow.phase === "phone" ? (
        <View className="gap-5">
          <View className="rounded-2xl border border-[#FDE6D5] bg-[#FFF7F0] p-4">
            <View className="flex-row items-start gap-2.5">
              <View className="mt-0.5">
                <ShieldIcon size={16} color="#EA580C" />
              </View>
              <View className="flex-1">
                <Text className="text-[14px] font-bold text-navy-900">Quick & Secure Login</Text>
                <Text className="mt-1 text-[13px] leading-relaxed text-text-secondary">
                  Use the mobile number you book with.{"\n"}We will text you a{" "}
                  <Text className="font-bold text-[#EA580C]">{flow.codeLength}-digit code</Text>.
                </Text>
              </View>
            </View>
          </View>

          <LoginPhoneField
            phone={flow.phone}
            onPhoneChange={flow.onPhoneChange}
            phoneError={flow.phoneError}
            codeLength={flow.codeLength}
          />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send code"
            disabled={!flow.canRequest || flow.isRequesting}
            onPress={flow.onRequestCode}
            className={cn(
              "min-h-12 items-center justify-center rounded-xl",
              !flow.canRequest ? "bg-[#EDE8E3]" : "bg-navy-900 active:bg-navy-800",
            )}
          >
            {flow.isRequesting ? (
              <View className="flex-row items-center gap-2">
                <ActivityIndicator size="small" color="#ffffff" />
                <Text className="text-[14px] font-semibold text-white">Sending code…</Text>
              </View>
            ) : (
              <Text
                className={cn(
                  "text-[14px] font-bold",
                  !flow.canRequest ? "text-[#8C857B]" : "text-white",
                )}
              >
                Send code →
              </Text>
            )}
          </Pressable>

          <View className="flex-row items-center justify-center gap-2 pt-0.5">
            <ShieldOutlineIcon size={14} color="#64748B" />
            <Text className="text-center text-[12px] leading-tight text-text-secondary">
              Your number is safe with us. We never share it with anyone.
            </Text>
          </View>
        </View>
      ) : null}

      {flow.phase === "code" ? (
        <View className="gap-4">
          <View className="flex-row items-center justify-between">
            <Text className="text-sm text-text-secondary">
              Code sent to <Text className="font-bold text-navy-900">{flow.phone}</Text>
            </Text>
            <Pressable onPress={flow.onChangeNumber} hitSlop={8}>
              <Text className="text-sm font-semibold text-[#EA580C]">Change number</Text>
            </Pressable>
          </View>

          {flow.developmentCode ? (
            <View className="rounded-xl border border-dashed border-line-strong bg-warm-50 px-3.5 py-2.5">
              <Text className="text-xs text-text-secondary">
                Development delivery is on. Code:{" "}
                <Text className="font-bold text-navy-900" style={{ letterSpacing: 3 }}>
                  {flow.developmentCode}
                </Text>
              </Text>
            </View>
          ) : null}

          <View className="gap-1.5">
            <View className="flex-row items-center">
              <Text className="text-[14px] font-bold text-navy-900">{flow.codeLength}-digit code</Text>
              <Text className="ml-1 text-[14px] font-bold text-[#EF4444]">*</Text>
            </View>
            <View
              className={cn(
                "mt-1 min-h-12 items-center justify-center overflow-hidden rounded-xl border bg-white",
                flow.codeError ? "border-danger" : "border-[#E2E8F0]",
              )}
            >
              <TextInput
                ref={codeInputRef}
                accessibilityLabel={`${flow.codeLength}-digit code`}
                keyboardType="number-pad"
                maxLength={flow.codeLength}
                placeholder="••••••"
                placeholderTextColor="#CBD5E1"
                value={flow.code}
                onChangeText={flow.onCodeChange}
                className="w-full text-center text-xl font-bold tracking-[0.3em] text-navy-900 py-2.5"
                style={{ outlineStyle: "none" } as never}
              />
            </View>
            {flow.codeError ? (
              <Text className="mt-1 text-xs font-medium text-danger">{flow.codeError}</Text>
            ) : null}
          </View>

          {flow.isExpired ? (
            <Text className="text-sm font-medium text-warning-text">
              This code has expired. Request a new one to continue.
            </Text>
          ) : flow.expiresInSeconds !== null ? (
            <Text className="text-xs text-text-secondary">
              Code expires in{" "}
              <Text className="font-bold text-navy-900">
                {formatDuration(flow.expiresInSeconds * 1000)}
              </Text>
            </Text>
          ) : null}

          <Pressable
            accessibilityRole="button"
            disabled={!flow.canVerify || flow.isVerifying}
            onPress={flow.onVerifyCode}
            className={cn(
              "min-h-12 items-center justify-center rounded-xl",
              !flow.canVerify ? "bg-[#EDE8E3]" : "bg-navy-900 active:bg-navy-800",
            )}
          >
            {flow.isVerifying ? (
              <View className="flex-row items-center gap-2">
                <ActivityIndicator size="small" color="#ffffff" />
                <Text className="text-[14px] font-semibold text-white">Verifying code…</Text>
              </View>
            ) : (
              <Text
                className={cn(
                  "text-[14px] font-bold",
                  !flow.canVerify ? "text-[#8C857B]" : "text-white",
                )}
              >
                {verifyLabel}
              </Text>
            )}
          </Pressable>

          <View className="items-center justify-center pt-1">
            {flow.resendInSeconds > 0 ? (
              <Text className="text-xs font-medium text-text-muted">
                Resend code in {formatDuration(flow.resendInSeconds * 1000)}
              </Text>
            ) : (
              <Pressable onPress={flow.onResendCode} disabled={flow.isRequesting} hitSlop={8}>
                <Text className="text-xs font-bold text-[#EA580C]">
                  {flow.isRequesting ? "Sending code…" : "Resend code"}
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      ) : null}
    </View>
  );
}

export function CustomerLoginExperience({
  flow,
  onClose,
  variant = "page",
  mobileFocused = false,
  footer,
  verifyLabel = "Verify and continue",
}: {
  flow: MobileOtpFlow;
  onClose?: () => void;
  variant?: "page" | "modal";
  mobileFocused?: boolean;
  footer?: ReactNode;
  verifyLabel?: string;
}) {
  return (
    <View
      className={cn(
        "w-full bg-white",
        variant === "page" && "max-w-md rounded-[2.25rem] border border-[#E5E7EB] px-5 py-6 sm:px-6 sm:py-8 shadow-xl",
        variant === "modal" && "rounded-[1.75rem] p-5",
      )}
      style={
        variant === "page"
          ? {
              borderRadius: 36,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.08,
              shadowRadius: 24,
              elevation: 4,
            }
          : undefined
      }
    >
      {onClose ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          hitSlop={8}
          className="absolute right-4 top-4 z-10 h-8 w-8 items-center justify-center rounded-full bg-surface-sunken"
        >
          <Text className="text-base text-text-secondary">✕</Text>
        </Pressable>
      ) : null}

      <View className="flex-col items-start">
        <Logo className="mb-3" />
        <Text className="text-[14px] leading-relaxed text-text-secondary">
          Verify your mobile number to view bookings and checkout
        </Text>
      </View>

      <View className="my-5 h-px bg-line/60" />

      <CustomerLoginForm flow={flow} verifyLabel={verifyLabel} />

      {footer ? <View className="mt-4">{footer}</View> : null}

      {!mobileFocused ? (
        <View className="mt-7">
          <LoginBenefits />
        </View>
      ) : null}
    </View>
  );
}
