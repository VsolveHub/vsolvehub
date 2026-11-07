// Ported from frontend/packages/ui/src/spinner.tsx
import { ActivityIndicator } from "react-native";

type SpinnerSize = "sm" | "md" | "lg";

const px: Record<SpinnerSize, number> = { sm: 16, md: 20, lg: 32 };

export function Spinner({
  size = "sm",
  className,
  color = "#00246b",
}: {
  size?: SpinnerSize;
  className?: string;
  color?: string;
}) {
  return (
    <ActivityIndicator
      accessibilityElementsHidden
      importantForAccessibility="no"
      size={px[size] >= 32 ? "large" : "small"}
      color={color}
      className={className}
    />
  );
}
