// Ported from frontend/apps/partner/features/application/view/selectable-row.tsx
import { Check } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Text } from "@vsolve/mobile-ui";

export function SelectableRow({
  checked,
  disabled,
  onChange,
  label,
  caption,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: () => void;
  label: string;
  caption?: string;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={onChange}
      style={({ pressed }) => ({
        minHeight: 56,
        flexDirection: "row",
        alignItems: "flex-start",
        columnGap: 12,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: checked ? "#ff6a00" : pressed ? "#cbd5e1" : "#e2e8f0",
        backgroundColor: checked ? "#fffbf5" : "#ffffff",
        padding: 16,
        opacity: disabled ? 0.6 : 1,
      })}
    >
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 4,
          borderWidth: 1.5,
          borderColor: checked ? "#ff6a00" : "#94a3b8",
          backgroundColor: checked ? "#ff6a00" : "#ffffff",
          alignItems: "center",
          justifyContent: "center",
          marginTop: 2,
        }}
      >
        {checked ? <Check size={14} color="#ffffff" strokeWidth={3} /> : null}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 15, fontWeight: "700", color: "#00112e" }}>
          {label}
        </Text>
        {caption ? (
          <Text style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>
            {caption}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
