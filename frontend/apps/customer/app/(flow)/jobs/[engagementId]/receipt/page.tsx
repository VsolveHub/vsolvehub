import type { Metadata } from "next";

import ReceiptPage from "../../../engagements/[engagementId]/receipt/page";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Payment receipt",
  robots: { index: false, follow: false },
};

export default ReceiptPage;
