// Ported from frontend/packages/ui/src/drawer.tsx
import type { ReactNode } from "react";

import { Sheet } from "./dialog";

export interface DrawerProps {
  children: ReactNode;
  trigger?: ReactNode;
  title: string;
  onOpenChange: (open: boolean) => void;
  side?: "right" | "left" | "bottom";
  open: boolean;
}

/** Phone drawer is a bottom sheet. `side` is kept so call sites stay valid. */
export function Drawer({ children, title, onOpenChange, open }: DrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title}>
      {children}
    </Sheet>
  );
}
