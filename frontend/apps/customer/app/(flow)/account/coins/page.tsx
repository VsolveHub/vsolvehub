import type { Metadata } from "next";

import { AccountSection } from "@/features/account/view/chrome";
import { CoinsScreen } from "@/features/coins/view/coins-screen";

export const metadata: Metadata = {
  title: "V Coins",
  robots: { index: false, follow: false },
};

export default function AccountCoinsPage() {
  return (
    <AccountSection
      title="V Coins Rewards"
      description="Loyalty coins earned on completed bookings. Redeem directly at checkout for discounts."
      collapseHeaderOnMobile
    >
      <CoinsScreen />
    </AccountSection>
  );
}
