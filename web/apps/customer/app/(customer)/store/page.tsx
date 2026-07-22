import { StoreClient } from "@/components/customer/store/StoreClient";

export const metadata = { title: "Store — V Solve Hub" };

/** Marketplace storefront: browse the same catalog that powers service add-ons. */
export default function StorePage() {
  return <StoreClient />;
}
