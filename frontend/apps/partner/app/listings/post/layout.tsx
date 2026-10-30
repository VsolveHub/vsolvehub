import type { Metadata } from "next";
import type { ReactNode } from "react";

/** The page is a client component and cannot export metadata itself. */
export const metadata: Metadata = { title: "Post a job" };

export default function PostListingLayout({ children }: { children: ReactNode }) {
  return children;
}
