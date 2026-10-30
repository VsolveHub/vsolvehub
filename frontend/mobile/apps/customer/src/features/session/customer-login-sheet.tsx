// Ported from frontend/apps/customer/features/session/view/customer-login-modal.tsx
import { useAuthStore, useMobileOtpFlow } from "@vsolve/mobile-core";
import { BlurBackdrop } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CustomerLoginExperience } from "./view/customer-login-experience";

export function CustomerLoginSheet({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const flow = useMobileOtpFlow();
  const router = useRouter();
  const status = useAuthStore((state) => state.status);
  const wasOpenRef = useRef(open);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      () => setIsKeyboardVisible(true)
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => setIsKeyboardVisible(false)
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    if (!open && wasOpenRef.current) {
      flow.reset();
      setIsKeyboardVisible(false);
    }
    wasOpenRef.current = open;
  }, [open, flow]);

  useEffect(() => {
    if (open && status === "signedIn") {
      onOpenChange(false);
      onSuccess?.();
    }
  }, [open, status, onOpenChange, onSuccess]);

  if (!open) return null;

  const shouldElevate = isKeyboardVisible || flow.phase === "code";

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={() => onOpenChange(false)}
    >
      <BlurBackdrop
        onPress={() => onOpenChange(false)}
        accessibilityLabel="Close dialog backdrop"
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
        keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: shouldElevate ? "flex-start" : "center",
            alignItems: "center",
            paddingHorizontal: 16,
            paddingTop: shouldElevate ? Math.max(insets.top + 12, 36) : 24,
            paddingBottom: isKeyboardVisible ? 16 : 24,
          }}
          keyboardShouldPersistTaps="always"
          bounces={false}
          showsVerticalScrollIndicator={false}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              Keyboard.dismiss();
              onOpenChange(false);
            }}
            accessibilityLabel="Close dialog backdrop"
          />
          <View
            onStartShouldSetResponder={() => true}
            className="w-full max-w-[370px]"
          >
            <CustomerLoginExperience
              flow={flow}
              variant="modal"
              mobileFocused
              onClose={() => {
                Keyboard.dismiss();
                onOpenChange(false);
              }}
              onBrowseServices={() => {
                Keyboard.dismiss();
                onOpenChange(false);
                router.push("/catalog" as never);
              }}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
