// Ported from frontend/packages/ui/src/field.tsx
import { createContext, useContext, useId, type ReactNode } from "react";
import { View } from "react-native";

import { cn } from "./cn";
import { Text } from "./text";

interface FieldContextValue {
  controlId: string;
  descriptionId: string | undefined;
  errorId: string | undefined;
  invalid: boolean;
  required: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

export function useFieldContext(): FieldContextValue | null {
  return useContext(FieldContext);
}

export interface FieldProps {
  label: string;
  children: ReactNode;
  description?: string;
  error?: string;
  required?: boolean;
  showOptional?: boolean;
  className?: string;
}

export function Field({
  label,
  description,
  error,
  required = false,
  showOptional = true,
  className,
  children,
}: FieldProps) {
  const id = useId();
  const controlId = `${id}-control`;
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <FieldContext.Provider
      value={{ controlId, descriptionId, errorId, invalid: Boolean(error), required }}
    >
      <View className={cn("gap-1.5", className)}>
        <Text className="text-sm font-semibold text-text" nativeID={controlId + "-label"}>
          {label}
          {required ? <Text className="text-danger-text"> *</Text> : null}
          {!required && showOptional ? (
            <Text className="font-normal text-text-muted"> (optional)</Text>
          ) : null}
        </Text>
        {description ? (
          <Text nativeID={descriptionId} className="text-sm text-text-secondary">
            {description}
          </Text>
        ) : null}
        {children}
        {error ? (
          <Text nativeID={errorId} accessibilityRole="alert" className="text-sm font-medium text-danger-text">
            {error}
          </Text>
        ) : null}
      </View>
    </FieldContext.Provider>
  );
}

export const controlChrome = cn(
  "w-full rounded-control border bg-surface px-3",
  "min-h-11 border-line-strong text-base text-text",
);
