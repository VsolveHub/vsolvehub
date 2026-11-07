import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { Button, ChoiceChips, Text } from "@vsolve/mobile-ui";
import { Flag, X } from "lucide-react-native";

export interface ReportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  reason: string;
  onReasonChange: (reason: string) => void;
  detail: string;
  onDetailChange: (detail: string) => void;
  onSubmit: () => void;
  isPending: boolean;
  error?: string;
}

const REPORT_REASONS = [
  { value: "spam_or_abuse", label: "Spam, Phishing, or Scam" },
  { value: "fraudulent", label: "Fraudulent or Asking for Upfront Payment" },
  { value: "inaccurate_details", label: "Inaccurate or Misleading Role Details" },
  { value: "offensive_content", label: "Offensive or Inappropriate Content" },
];

export function ReportDialog({
  isOpen,
  onClose,
  reason,
  onReasonChange,
  detail,
  onDetailChange,
  onSubmit,
  isPending,
  error,
}: ReportDialogProps) {
  if (!isOpen) return null;

  return (
    <Modal visible={isOpen} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 justify-end bg-black/60"
      >
        <View className="max-h-[90%] rounded-t-3xl border-t border-line bg-surface p-5 pb-8 shadow-2xl">
          <View className="flex-row items-center justify-between border-b border-line pb-3">
            <View className="flex-row items-center gap-2">
              <Flag size={18} color="#f87000" />
              <Text className="text-base font-bold text-text">Report Listing</Text>
            </View>
            <Pressable hitSlop={12} accessibilityRole="button" accessibilityLabel="Close report dialog" onPress={onClose} className="p-1">
              <X size={18} color="#6B6560" />
            </Pressable>
          </View>

          <ScrollView className="my-3" showsVerticalScrollIndicator={false}>
            <Text className="text-xs text-text-muted">
              Help us maintain community safety. Reports open an immediate review ticket for our
              operations team.
            </Text>

            <View className="mt-4 gap-3">
              <View>
                <Text className="mb-2 text-xs font-semibold text-text">Select Reason</Text>
                <ChoiceChips
                  label="Report Reason"
                  name="report-reason"
                  options={REPORT_REASONS}
                  value={reason}
                  onChange={onReasonChange}
                  layout="wrap"
                />
              </View>

              <View>
                <Text className="mb-1 text-xs font-semibold text-text">Additional Details</Text>
                <TextInput
                  value={detail}
                  onChangeText={onDetailChange}
                  multiline
                  numberOfLines={3}
                  placeholder="Describe the issue you noticed..."
                  placeholderTextColor="rgba(107,101,96,0.6)"
                  className="min-h-20 rounded-xl border border-line bg-canvas p-3 text-xs text-text"
                />
              </View>

              {error ? (
                <Text className="text-xs font-semibold text-danger-text">{error}</Text>
              ) : null}
            </View>
          </ScrollView>

          <View className="mt-2 flex-row gap-2">
            <Button
              variant="secondary"
              size="md"
              onPress={onClose}
              className="flex-1"
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              onPress={onSubmit}
              className="flex-1"
              disabled={isPending || !reason}
            >
              {isPending ? "Submitting..." : "Submit Report"}
            </Button>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
