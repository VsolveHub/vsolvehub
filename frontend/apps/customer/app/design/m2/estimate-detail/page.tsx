import { EstimateDetailScreen } from "@/features/quotes/view/gallery/estimate-detail-screen";
import {
  SAMPLE_ESTIMATES,
  SAMPLE_INSTALLMENTS,
  SAMPLE_MATERIALS_ADVANCE,
  SAMPLE_MONEY,
  SAMPLE_PARTNER,
} from "@/lib/design-gallery/sample";

/**
 * Design gallery only. Pure component, fixed sample values, no fetching — the
 * estimate contract lands with proposal 0015. The chosen estimate is Ravi's,
 * which is the one `SAMPLE_MONEY` and `SAMPLE_INSTALLMENTS` describe.
 */
export const metadata = { robots: { index: false, follow: false } };

export default function EstimateDetailPage() {
  const estimate = SAMPLE_ESTIMATES[0];

  return (
    <main className="min-h-[100dvh] bg-canvas p-6">
      <div className="mx-auto h-[844px] w-[390px] overflow-hidden border border-line">
        <EstimateDetailScreen
          partnerName={SAMPLE_PARTNER.name}
          estimate={estimate}
          money={SAMPLE_MONEY}
          installments={SAMPLE_INSTALLMENTS}
          materialsAdvance={SAMPLE_MATERIALS_ADVANCE}
        />
      </div>
    </main>
  );
}
