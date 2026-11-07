// Ported from frontend/apps/customer/features/session/view/login-referral-input.tsx
import { Badge, Button, Text } from "@vsolve/mobile-ui";
import { CheckCircle2, Gift, Tag } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { Pressable, TextInput, View } from "react-native";

import { useValidateReferralCode } from "@/features/account/queries";
import { readPendingReferral, savePendingReferral } from "@/features/referral/pending-referral";

export function LoginReferralInput() {
  const [isOpen, setIsOpen] = useState(() => Boolean(readPendingReferral()));
  const [code, setCode] = useState(() => readPendingReferral() ?? "");
  const [validationSuccess, setValidationSuccess] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const validateMutation = useValidateReferralCode();
  const isValidating = validateMutation.isPending;

  const validateCode = useCallback(
    async (codeToTest: string) => {
      const clean = codeToTest.trim().toUpperCase();
      if (!clean) return;

      setValidationError(null);
      try {
        const data = await validateMutation.mutateAsync(clean);
        if (data?.valid) {
          setValidationSuccess(data.referee_reward_summary || "Referral reward confirmed!");
          savePendingReferral(clean);
        } else {
          setValidationError("Invalid referral code");
          setValidationSuccess(null);
        }
      } catch {
        setValidationError("Referral code is not recognized");
        setValidationSuccess(null);
      }
    },
    [validateMutation],
  );

  useEffect(() => {
    const pendingCode = readPendingReferral();
    if (pendingCode) {
      const timer = setTimeout(() => {
        void validateCode(pendingCode);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [validateCode]);

  const handleApplyClick = () => {
    void validateCode(code);
  };

  if (!isOpen && !validationSuccess) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Have an invite code? Apply it only at signup"
        onPress={() => setIsOpen(true)}
        className="min-h-11 flex-row items-center gap-1.5 py-1"
      >
        <Gift size={16} color="#EA580C" />
        <Text className="text-sm font-semibold text-[#EA580C]">
          Have an invite code? Apply it only at signup
        </Text>
      </Pressable>
    );
  }

  return (
    <View className="rounded-xl border border-[#e7e2da] bg-[#FAF9F7] p-3">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-1.5">
          <Tag size={16} color="#EA580C" />
          <Text className="text-xs font-semibold text-navy-900">Referral Invite</Text>
        </View>
        {validationSuccess ? (
          <Badge tone="success">
            Applied
          </Badge>
        ) : null}
      </View>

      {validationSuccess ? (
        <View className="mt-2 flex-row items-center gap-2">
          <CheckCircle2 size={16} color="#059669" />
          <Text className="text-xs font-medium text-emerald-800">{validationSuccess}</Text>
        </View>
      ) : (
        <View className="mt-2 flex-row gap-2">
          <TextInput
            accessibilityLabel="Referral invite code"
            value={code}
            onChangeText={(text) => setCode(text.toUpperCase())}
            placeholder="e.g. VS9876A1"
            placeholderTextColor="#94A3B8"
            autoCapitalize="characters"
            className="h-9 flex-1 rounded-lg border border-[#e7e2da] bg-white px-2.5 font-mono text-xs uppercase text-navy-900"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={isValidating || !code.trim()}
            onPress={handleApplyClick}
          >
            {isValidating ? "..." : "Apply"}
          </Button>
        </View>
      )}

      {validationError ? (
        <Text className="mt-1 text-xs font-medium text-rose-600">{validationError}</Text>
      ) : null}
      <Text className="mt-2 text-xs leading-relaxed text-text-secondary">
        The code is applied when you create your account. An existing account cannot add one.
      </Text>
    </View>
  );
}
