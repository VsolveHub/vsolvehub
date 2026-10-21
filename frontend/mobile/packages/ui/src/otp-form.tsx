// Ported from frontend/packages/ui/src/otp-form.tsx
import { useEffect, useRef, type ReactNode } from "react";
import { TextInput, View } from "react-native";

import { Button } from "./button";
import { cn } from "./cn";
import { ErrorState, type ErrorSeverity } from "./error-state";
import { Field } from "./field";
import { Input } from "./input";
import { formatDuration } from "./readout";
import { Text } from "./text";

export interface OtpFormProps {
  phase: "phone" | "code" | "authenticated";
  phone: string;
  onPhoneChange: (value: string) => void;
  code: string;
  onCodeChange: (value: string) => void;
  onRequestCode: () => void;
  onVerifyCode: () => void;
  onResendCode: () => void;
  onChangeNumber: () => void;
  onLogout?: () => void;
  canRequest: boolean;
  canVerify: boolean;
  isRequesting: boolean;
  isVerifying: boolean;
  isLoggingOut?: boolean;
  resendInSeconds: number;
  expiresInSeconds: number | null;
  isExpired: boolean;
  phoneError?: string | null;
  codeError?: string | null;
  failure?: { title: string; message: string; severity: ErrorSeverity; reference: string | null } | null;
  signedInPhone?: string | null;
  developmentCode?: string | null;
  codeLength: number;
  heading?: string;
  headingLevel?: 1 | 2 | 3;
  description?: string;
  verifyLabel?: string;
  footer?: ReactNode;
  className?: string;
}

export function OtpForm({
  phase,
  phone,
  onPhoneChange,
  code,
  onCodeChange,
  onRequestCode,
  onVerifyCode,
  onResendCode,
  onChangeNumber,
  onLogout,
  canRequest,
  canVerify,
  isRequesting,
  isVerifying,
  isLoggingOut = false,
  resendInSeconds,
  expiresInSeconds,
  isExpired,
  phoneError,
  codeError,
  failure,
  signedInPhone,
  developmentCode,
  codeLength,
  heading = "Log in",
  description,
  verifyLabel = "Verify and continue",
  footer,
  className,
}: OtpFormProps) {
  const codeRef = useRef<TextInput>(null);
  useEffect(() => {
    if (phase === "code") codeRef.current?.focus();
  }, [phase]);

  return (
    <View className={cn("w-full max-w-sm", className)}>
      <Text className="text-xl font-bold text-text">{heading}</Text>
      {description ? <Text className="mt-1.5 text-sm text-text-secondary">{description}</Text> : null}
      {failure ? (
        <ErrorState inline className="mt-4" title={failure.title} message={failure.message} severity={failure.severity} reference={failure.reference} />
      ) : null}
      {phase === "authenticated" ? (
        <View className="mt-4">
          <Text className="text-sm text-text-secondary">Logged in as</Text>
          <Text className="text-base font-semibold tabular-nums text-text">{signedInPhone}</Text>
          {onLogout ? (
            <Button variant="outline" className="mt-3" onPress={onLogout} loading={isLoggingOut} loadingLabel="Logging out">
              Use a different number
            </Button>
          ) : null}
        </View>
      ) : null}
      {phase === "phone" ? (
        <View className="mt-5 gap-4">
          <Field required label="Mobile number" description={`We will send a ${codeLength}-digit code by SMS.`} error={phoneError ?? undefined}>
            <Input
              keyboardType="number-pad"
              autoComplete="tel"
              placeholder="9876543210"
              maxLength={10}
              value={phone}
              onChangeText={onPhoneChange}
            />
          </Field>
          <Button size="lg" block disabled={!canRequest} loading={isRequesting} loadingLabel="Sending code" onPress={onRequestCode}>
            Send code
          </Button>
        </View>
      ) : null}
      {phase === "code" ? (
        <View className="mt-5 gap-4">
          <View className="flex-row items-center justify-between">
            <Text className="text-sm text-text-secondary">
              Code sent to <Text className="font-semibold tabular-nums text-text">{phone}</Text>
            </Text>
            <Button variant="ghost" size="sm" onPress={onChangeNumber}>
              Change number
            </Button>
          </View>
          {developmentCode ? (
            <View className="rounded-control border border-dashed border-line-strong px-3 py-2">
              <Text className="text-sm text-text-secondary">
                Development delivery is on. Code:{" "}
                <Text className="font-semibold text-text" style={{ letterSpacing: 4 }}>
                  {developmentCode}
                </Text>
              </Text>
            </View>
          ) : null}
          <Field required label={`${codeLength}-digit code`} error={codeError ?? undefined}>
            <Input
              ref={codeRef}
              keyboardType="number-pad"
              autoComplete="sms-otp"
              maxLength={codeLength}
              value={code}
              onChangeText={onCodeChange}
              className="text-center text-lg font-semibold"
            />
          </Field>
          {isExpired ? (
            <Text className="text-sm font-medium text-warning-text">This code has expired. Request a new one to continue.</Text>
          ) : expiresInSeconds !== null ? (
            <Text className="text-sm text-text-secondary">
              Code expires in <Text className="font-semibold tabular-nums">{formatDuration(expiresInSeconds * 1000)}</Text>
            </Text>
          ) : null}
          <Button size="lg" block disabled={!canVerify} loading={isVerifying} loadingLabel="Verifying code" onPress={onVerifyCode}>
            {verifyLabel}
          </Button>
          {resendInSeconds > 0 ? (
            <Button variant="ghost" size="sm" disabled>
              {`Resend code in ${formatDuration(resendInSeconds * 1000)}`}
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onPress={onResendCode} loading={isRequesting} loadingLabel="Sending a new code">
              Resend code
            </Button>
          )}
        </View>
      ) : null}
      {footer ? <View className="mt-5">{footer}</View> : null}
    </View>
  );
}
