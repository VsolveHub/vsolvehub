import { FundInstallmentScreen } from "@/features/quotes/view/gallery/fund-installment-screen";
import {
  SAMPLE_INSTALLMENTS,
  SAMPLE_MATERIALS_ADVANCE,
  SAMPLE_MONEY,
  SAMPLE_PARTNER,
} from "@/lib/design-gallery/sample";

/**
 * Design gallery only. Pure component, fixed sample values, no fetching. The
 * stage shown is the first installment — the advance is already paid, which is
 * what the four-segment rail is saying.
 */
export const metadata = { title: "Fund an installment — M2", robots: { index: false, follow: false } };

export default function FundInstallmentPage() {
  return (
    <main className="min-h-[100dvh] bg-canvas p-6">
      <div className="mx-auto h-[844px] w-[390px] overflow-hidden border border-line">
        <FundInstallmentScreen
          partnerName={SAMPLE_PARTNER.name}
          installment={SAMPLE_INSTALLMENTS[0]}
          installments={SAMPLE_INSTALLMENTS}
          materialsAdvance={SAMPLE_MATERIALS_ADVANCE}
          taxLabel={SAMPLE_MONEY.taxLabel}
        />
      </div>
    </main>
  );
}
