import type { Metadata } from "next";

import { AccountSection } from "@/features/account/view/chrome";
import { ReferralScreen } from "@/features/referral/view/referral-screen";

export const metadata: Metadata = {
  title: "Refer & Earn",
  robots: { index: false, follow: false },
};

export default function AccountReferralPage() {
  return (
    <AccountSection
      title="Refer Friends & Earn"
      description="Invite friends to Vsolve. When they book, you both get wallet credits to use on home services."
      collapseHeaderOnMobile
    >
      <ReferralScreen />
    </AccountSection>
  );
}
