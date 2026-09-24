import type { Metadata } from "next";

import { AccountSection } from "@/features/account/view/chrome";
import { WalletScreen } from "@/features/wallet/view/wallet-screen";

export const metadata: Metadata = {
  title: "Wallet",
  robots: { index: false, follow: false },
};

export default function AccountWalletPage() {
  return (
    <AccountSection
      title="Vsolve Wallet"
      description="Prepaid balance for instant, 1-click booking checkouts and automated refunds."
      collapseHeaderOnMobile
    >
      <WalletScreen />
    </AccountSection>
  );
}
