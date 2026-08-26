import { EstimatesCompareScreen } from "@/features/quotes/view/gallery/estimates-compare-screen";
import { SAMPLE_ESTIMATES } from "@/lib/design-gallery/sample";

/**
 * Design gallery only.
 *
 * The compare screen has no contract behind it yet, so it is rendered here as a
 * pure component over fixed sample values rather than wired to an endpoint that
 * would have to be invented. Nothing on this route reads a session, and the
 * screen itself fetches nothing — see `lib/design-gallery/sample`.
 */
export const metadata = { robots: { index: false, follow: false } };

export default function EstimatesComparePage() {
  return (
    <main className="min-h-[100dvh] bg-canvas p-6">
      <div className="mx-auto h-[844px] w-[390px] overflow-hidden border border-line">
        <EstimatesCompareScreen estimates={SAMPLE_ESTIMATES} />
      </div>
    </main>
  );
}
