import { AddressBook } from "@/features/account/view/address-book";
import { AccountHome } from "@/features/account/view/account-home";
import { useIsDesktop } from "@/lib/responsive";

export default function Screen() {
  const isDesktop = useIsDesktop();
  if (isDesktop) {
    return <AccountHome initialSection="addresses" />;
  }
  return <AddressBook />;
}
