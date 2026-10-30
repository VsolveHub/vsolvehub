import type { Metadata } from "next";
import type { ReactNode } from "react";

/** Internal design gallery with sample data: never a search result. */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function DesignLayout({ children }: { children: ReactNode }) {
  return children;
}
