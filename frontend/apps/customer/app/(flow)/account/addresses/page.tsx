import type { Metadata } from "next";

import { AddressBook } from "@/features/addresses/view/address-book";
import { AccountSection } from "@/features/account/view/chrome";

/**
 * The saved address book.
 *
 * A server shell around a client component, with no server-side data access, so
 * it prerenders and every address is fetched in the browser under the caller's
 * own credentials. Addresses must never reach static output.
 *
 * Never indexed: it is where somebody lives.
 */
export const metadata: Metadata = {
  title: "Saved addresses",
  robots: { index: false, follow: false },
};

export default function AccountAddressesPage() {
  return (
    <AccountSection
      title="Saved addresses"
      description="Where we send someone when you book. Pick one at checkout instead of typing it again."
      collapseHeaderOnMobile
    >
      <AddressBook />
    </AccountSection>
  );
}
