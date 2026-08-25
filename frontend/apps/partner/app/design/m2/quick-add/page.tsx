import type { Metadata } from "next";

import {
  QuickAddSheet,
  type QuickAddPreset,
} from "@/features/proposal/view/parts/quick-add-sheet";

/**
 * Gallery: the quick-add sheet, over the screen it covers.
 *
 * The presets below are one electrician's history — what this partner last
 * charged, which is the only kind of number the tiles are allowed to show. They
 * are sample data for the gallery and nothing else: no production route may
 * import them, and none does.
 *
 * Outside `PartnerShell` for the same reason as the items gallery — the sheet
 * belongs to a pushed task screen, which draws no persistent chrome.
 */

export const metadata: Metadata = {
  title: "Quick add common items",
  robots: { index: false, follow: false },
};

const ELECTRICIAN_PRESETS: readonly QuickAddPreset[] = [
  { id: "switch-6a", name: "Switch (6A)", unit: "Nos", lastRate: "₹80" },
  { id: "socket-6a", name: "Socket (6A)", unit: "Nos", lastRate: "₹100" },
  { id: "fan", name: "Fan", unit: "Nos", lastRate: "₹150" },
  { id: "light", name: "Light", unit: "Nos", lastRate: "₹120" },
  { id: "mcb-sp", name: "MCB (SP)", unit: "Nos", lastRate: "₹150" },
  { id: "mcb-dp", name: "MCB (DP)", unit: "Nos", lastRate: "₹250" },
  { id: "tube-light", name: "Tube Light", unit: "Nos", lastRate: "₹120" },
  { id: "db-box", name: "DB Box", unit: "Nos", lastRate: "₹200" },
];

const SELECTED = ["switch-6a", "socket-6a"];

export default function QuickAddGalleryPage() {
  return (
    <div className="min-h-screen bg-canvas py-6">
      <div className="mx-auto h-[844px] w-[390px] overflow-hidden border border-line">
        <div className="relative h-full w-full bg-canvas">
          {/* The scrim. Dark enough that the sheet is unmistakably the active
              surface, light enough that the estimate behind it stays legible —
              a partner needs to see which line they are adding to. */}
          <div aria-hidden className="absolute inset-0 bg-navy-900/40" />

          <div className="absolute inset-x-0 bottom-0">
            <QuickAddSheet presets={ELECTRICIAN_PRESETS} selectedIds={SELECTED} />
          </div>
        </div>
      </div>
    </div>
  );
}
