// Ported from frontend/packages/ui/src/input.tsx
import type { Ref } from "react";
import { TextInput, type TextInputProps } from "react-native";

import { cn } from "./cn";
import { controlChrome, useFieldContext } from "./field";

export interface InputProps extends Omit<TextInputProps, "id"> {
  id?: string;
  className?: string;
  ref?: Ref<TextInput>;
}

export function Input({ className, id, ref, ...props }: InputProps) {
  const field = useFieldContext();
  return (
    <TextInput
      ref={ref}
      nativeID={id ?? field?.controlId}
      accessibilityLabelledBy={field ? undefined : undefined}
      aria-invalid={field?.invalid || undefined}
      className={cn(controlChrome, "py-2.5 text-base text-text", field?.invalid && "border-danger-text bg-danger-surface", className)}
      placeholderTextColor="#756c5e"
      {...props}
    />
  );
}

export interface TextareaProps extends InputProps {
  rows?: number;
}

export function Textarea({ className, id, rows = 4, ...props }: TextareaProps) {
  const field = useFieldContext();
  return (
    <TextInput
      nativeID={id ?? field?.controlId}
      multiline
      numberOfLines={rows}
      textAlignVertical="top"
      className={cn(controlChrome, "py-2.5 text-base text-text", field?.invalid && "border-danger-text bg-danger-surface", className)}
      placeholderTextColor="#756c5e"
      {...props}
    />
  );
}
