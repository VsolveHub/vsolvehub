import { WalletScreen } from "@/features/account/view/wallet-screen";
import { AccountHome } from "@/features/account/view/account-home";
import { useIsDesktop } from "@/lib/responsive";

export default function Screen() {
  const isDesktop = useIsDesktop();
  if (isDesktop) {
    return <AccountHome initialSection="wallet" />;
  }
  return <WalletScreen />;
}
