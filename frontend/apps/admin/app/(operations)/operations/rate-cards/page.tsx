import type { Metadata } from "next";

import { RateCardBoard } from "@/features/m2-rate-cards/view/rate-card-board";


export const metadata: Metadata = {
  title: "Rate cards",
  robots: { index: false, follow: false },
};

export default function RateCardsPage() {
  return (
    <>
      <div className="mt-6">
        <RateCardBoard />
      </div>
    </>
  );
}
