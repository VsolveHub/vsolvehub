import type { Metadata } from "next";

import { SwitchBoard } from "@/features/kill-switches/view/switch-board";


export const metadata: Metadata = {
  title: "Kill switches",
  robots: { index: false, follow: false },
};

export default function KillSwitchesPage() {
  return (
    <>
      <div className="mt-6">
        <SwitchBoard />
      </div>
    </>
  );
}
