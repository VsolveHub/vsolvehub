// Ported from frontend/apps/customer/features/session/view/customer-login-experience.tsx
// Redesigned to 100% exact parity with the V Solve Hub mobile login popup reference image
import type { MobileOtpFlow } from "@vsolve/mobile-core";
import { ErrorState, Logo, Text, cn, formatDuration } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { ChevronDown, ChevronRight, LayoutGrid, X } from "lucide-react-native";
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
}: {
  phone: string;
  onPhoneChange: (value: string) => void;
  phoneError?: string | null;
}) {
  return (
    <View className="gap-1">
      <View
        className={cn(
          "h-[54px] flex-row items-center overflow-hidden rounded-2xl border bg-white",
          phoneError ? "border-danger" : "border-[#E2E8F0]",
        )}
      >
        <View className="h-full flex-row items-center gap-1.5 border-r border-[#E2E8F0] bg-[#F1F5F9] px-3.5">
          <Text className="text-[13.5px] font-extrabold text-navy-950">IN  +91</Text>
          <ChevronDown size={14} color="#64748B" strokeWidth={2.2} />
        </View>
        <TextInput
          accessibilityLabel="Mobile number"
          keyboardType="number-pad"
          maxLength={10}
          placeholder="9876543210"
          placeholderTextColor="#94A3B8"
          value={phone}
          onChangeText={onPhoneChange}
          className="flex-1 h-full px-4 text-[16px] font-bold text-navy-950"
          style={{ outlineStyle: "none" } as never}
        />
      </View>
      {phoneError ? (
        <Text className="mt-1 text-xs font-semibold text-danger">{phoneError}</Text>
      ) : null}
    </View>
  );
}

export function CustomerLoginForm({
  flow,
  verifyLabel = "Verify and continue",
  onBrowseServices,
}: {
  flow: MobileOtpFlow;
  verifyLabel?: string;
  onBrowseServices?: () => void;
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
        <View className="gap-4">
          <LoginPhoneField
            phone={flow.phone}
            onPhoneChange={flow.onPhoneChange}
            phoneError={flow.phoneError}
          />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send code"
            disabled={flow.isRequesting}
            onPress={flow.onRequestCode}
            className={cn(
              "h-[52px] w-full flex-row items-center justify-center rounded-2xl bg-[#FF5500] active:bg-[#E04B00] shadow-xs active:scale-[0.99]",
              flow.isRequesting && "opacity-80",
            )}
          >
            {flow.isRequesting ? (
              <View className="flex-row items-center gap-2">
                <ActivityIndicator size="small" color="#ffffff" />
                <Text className="text-[16px] font-bold text-white">Sending code…</Text>
              </View>
            ) : (
              <Text className="text-[16px] font-bold text-white">
                Send code →
              </Text>
            )}
          </Pressable>

          {/* Divider matching exact reference image */}
          <View className="my-1 flex-row items-center">
            <View className="h-[1px] flex-1 bg-[#E2E8F0]" />
            <Text className="px-3 text-xs text-[#94A3B8] font-normal lowercase">or</Text>
            <View className="h-[1px] flex-1 bg-[#E2E8F0]" />
          </View>

          {/* Secondary Button matching exact reference image */}
          {onBrowseServices ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Browse services first"
              onPress={onBrowseServices}
              className="h-[52px] w-full flex-row items-center justify-center gap-2 rounded-2xl border border-[#FFEDD5] bg-[#FFF7ED] active:bg-[#FFEDD5]"
            >
              <LayoutGrid size={18} color="#EA580C" strokeWidth={2.2} />
              <Text className="text-[14px] font-bold text-[#7C2D12]">
                Browse services first
              </Text>
              <ChevronRight size={15} color="#EA580C" strokeWidth={2.5} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {flow.phase === "code" ? (
        <View className="gap-4">
          <View className="flex-row items-center justify-between">
            <Text className="text-sm text-text-secondary">
              Code sent to <Text className="font-bold text-navy-900">+91 {flow.phone}</Text>
            </Text>
            <Pressable onPress={flow.onChangeNumber} hitSlop={8}>
              <Text className="text-sm font-semibold text-[#EA580C]">Change number</Text>
            </Pressable>
          </View>

          {flow.developmentCode ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Fill development code ${flow.developmentCode}`}
              onPress={() => {
                if (flow.developmentCode) {
                  flow.onCodeChange(flow.developmentCode);
                  setTimeout(() => {
                    flow.onVerifyCode();
                  }, 80);
                }
              }}
              hitSlop={6}
              className="rounded-xl border border-dashed border-line-strong bg-warm-50 px-3.5 py-2 active:bg-warm-100"
            >
              <Text className="text-xs text-text-secondary">
                Development code:{" "}
                <Text className="font-bold text-navy-900" style={{ letterSpacing: 2 }}>
                  {flow.developmentCode}
                </Text>{" "}
                <Text className="text-[11px] font-semibold text-[#EA580C]">(Tap to verify)</Text>
              </Text>
            </Pressable>
          ) : null}

          <View className="gap-1.5">
            <View className="flex-row items-center">
              <Text className="text-[14px] font-bold text-navy-900">{flow.codeLength}-digit code</Text>
              <Text className="ml-1 text-[14px] font-bold text-[#EF4444]">*</Text>
            </View>
            <View
              className={cn(
                "mt-0.5 h-[52px] items-center justify-center overflow-hidden rounded-2xl border bg-white",
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
                onChangeText={(text) => {
                  flow.onCodeChange(text);
                  const clean = text.replace(/\D/g, "");
                  if (clean.length === flow.codeLength) {
                    setTimeout(() => {
                      flow.onVerifyCode();
                    }, 80);
                  }
                }}
                className="w-full text-center text-xl font-bold tracking-[0.3em] text-navy-900 py-2"
                style={{ outlineStyle: "none" } as never}
              />
            </View>
            {flow.codeError ? (
              <Text className="mt-0.5 text-xs font-medium text-danger">{flow.codeError}</Text>
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
              "h-[50px] w-full flex-row items-center justify-center rounded-2xl shadow-xs",
              !flow.canVerify
                ? "bg-[#FF5500]/50"
                : "bg-[#FF5500] active:bg-[#E04B00] active:scale-[0.99]",
            )}
          >
            {flow.isVerifying ? (
              <View className="flex-row items-center gap-2">
                <ActivityIndicator size="small" color="#ffffff" />
                <Text className="text-[16px] font-bold text-white">Verifying code…</Text>
              </View>
            ) : (
              <Text className="text-[16px] font-bold text-white">
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
  onBrowseServices,
  variant = "page",
  mobileFocused = false,
  footer,
  verifyLabel = "Verify and continue",
}: {
  flow: MobileOtpFlow;
  onClose?: () => void;
  onBrowseServices?: () => void;
  variant?: "page" | "modal";
  mobileFocused?: boolean;
  footer?: ReactNode;
  verifyLabel?: string;
}) {
  const router = useRouter();

  const handleBrowse = () => {
    if (onBrowseServices) {
      onBrowseServices();
    } else {
      onClose?.();
      router.push("/catalog" as never);
    }
  };

  return (
    <View
      className={cn(
        "w-full bg-white",
        variant === "page" && "max-w-[400px] rounded-[28px] border border-[#E5E7EB] p-6 sm:p-7 shadow-xl",
        variant === "modal" && cn(
          "max-w-[370px] rounded-[28px] border border-black/[0.04] shadow-2xl",
          flow.phase === "code" ? "p-5 pb-5 pt-4" : "p-6 pb-6 pt-5"
        ),
      )}
      style={{
        borderRadius: 28,
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 16 },
        shadowOpacity: 0.12,
        shadowRadius: 32,
        elevation: 8,
      }}
    >
      {/* Header Row: Logo on left, Round Close button on right */}
      <View className="flex-row items-center justify-between">
        <Logo />
        {onClose ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close login dialog"
            onPress={onClose}
            hitSlop={10}
            className="h-9 w-9 items-center justify-center rounded-full bg-[#F3F4F6] active:bg-[#E5E7EB]"
          >
            <X size={16} color="#475569" strokeWidth={2.2} />
          </Pressable>
        ) : null}
      </View>

      {/* Title & Subtitle */}
      <View className={cn("mt-5 mb-5", flow.phase === "code" && "mt-3 mb-3")}>
        {flow.phase === "phone" ? (
          <>
            <Text className="text-[22px] sm:text-[24px] font-black tracking-tight text-[#071328] leading-[1.2]">
              Enter your mobile number
            </Text>
            <Text className="mt-1.5 text-[13.5px] text-[#64748B] leading-[20px]">
              We’ll send you a 6-digit verification code to login and view your bookings.
            </Text>
          </>
        ) : flow.phase === "code" ? (
          <>
            <Text className="text-[22px] sm:text-[24px] font-black tracking-tight text-[#071328] leading-[1.2]">
              Verify your number
            </Text>
            <Text className="mt-1.5 text-[13.5px] text-[#64748B] leading-[20px]">
              Enter the 6-digit code sent to{" "}
              <Text className="font-bold text-[#071328]">+91 {flow.phone}</Text>.
            </Text>
          </>
        ) : (
          <>
            <Text className="text-[22px] sm:text-[24px] font-black tracking-tight text-[#071328] leading-[1.2]">
              Signed in
            </Text>
            <Text className="mt-1.5 text-[13.5px] text-[#64748B] leading-[20px]">
              You are currently signed in.
            </Text>
          </>
        )}
      </View>

      <CustomerLoginForm
        flow={flow}
        verifyLabel={verifyLabel}
        onBrowseServices={footer ? undefined : handleBrowse}
      />

      {footer && flow.phase === "phone" ? <View className="mt-4">{footer}</View> : null}

      {!mobileFocused ? (
        <View className="mt-7">
          <LoginBenefits />
        </View>
      ) : null}
    </View>
  );
}

