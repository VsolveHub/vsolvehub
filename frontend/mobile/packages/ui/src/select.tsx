// Ported from frontend/packages/ui/src/select.tsx
import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";

import { cn } from "./cn";
import { controlChrome, useFieldContext } from "./field";
import { Sheet } from "./dialog";
import { Text } from "./text";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  id?: string;
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  options?: readonly SelectOption[];
  children?: ReactNode;
  onChange?: (event: { target: { value: string } }) => void;
}

export function Select({
  id,
  value,
  placeholder,
  disabled,
  className,
  options = [],
  onChange,
}: SelectProps) {
  const field = useFieldContext();
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);
  return (
    <View>
      <Pressable
        nativeID={id ?? field?.controlId}
        accessibilityRole="button"
        accessibilityState={{ disabled, expanded: open }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        className={cn(controlChrome, "justify-center py-2.5", field?.invalid && "border-danger-text bg-danger-surface", className)}
      >
        <Text className={cn("text-base", selected ? "text-text" : "text-text-muted")}>
          {selected?.label ?? placeholder ?? ""}
        </Text>
      </Pressable>
      <Sheet open={open} onOpenChange={setOpen} title={placeholder ?? "Choose"}>
        {options.map((option) => (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            disabled={option.disabled}
            onPress={() => {
              onChange?.({ target: { value: option.value } });
              setOpen(false);
            }}
            className="min-h-11 justify-center border-b border-line"
          >
            <Text className={cn("text-base", option.value === value ? "font-semibold text-text" : "text-text-secondary")}>
              {option.label}
            </Text>
          </Pressable>
        ))}
      </Sheet>
    </View>
  );
}
