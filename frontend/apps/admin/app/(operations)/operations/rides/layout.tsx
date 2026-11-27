import type { Metadata } from "next";
import type { ReactNode } from "react";

/** The pages are client components and cannot export metadata themselves. */
export const metadata: Metadata = { title: "Rides" };

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
