import type { Metadata } from "next";

import { ReviewStep } from "@/features/application/view/review-step";

export const metadata: Metadata = { title: "Review and send" };

export default function ReviewPage() {
  return <ReviewStep />;
}
