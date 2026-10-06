// Ported from frontend/packages/ui/src/toast.tsx
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { cn } from "./cn";
import { Text } from "./text";

type ToastTone = "success" | "info" | "danger";
interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}
interface ToastContextValue {
  notify: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);
const AUTO_DISMISS_MS = 5_000;
const chrome: Record<ToastTone, string> = {
  success: "bg-success-surface",
  info: "bg-info-surface",
  danger: "bg-danger-surface",
};
const ink: Record<ToastTone, string> = {
  success: "text-success-text",
  info: "text-info-text",
  danger: "text-danger-text",
};

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside a ToastProvider.");
  return context;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);
  const insets = useSafeAreaInsets();
  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);
  const notify = useCallback(
    (message: string, tone: ToastTone = "success") => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, tone, message }]);
      if (tone !== "danger") setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss],
  );
  const value = useMemo(() => ({ notify }), [notify]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <View pointerEvents="box-none" className="absolute inset-x-0 gap-2 px-4" style={{ top: insets.top + 8 }}>
        {toasts.map((toast) => (
          <Pressable key={toast.id} onPress={() => dismiss(toast.id)} className={cn("rounded-control px-4 py-3", chrome[toast.tone])}>
            <Text className={cn("text-sm font-semibold", ink[toast.tone])}>{toast.message}</Text>
          </Pressable>
        ))}
      </View>
    </ToastContext.Provider>
  );
}
