import type { Metadata } from "next";

import { QueueBoard } from "@/features/m2-requests/view/queue-board";


export const metadata: Metadata = {
  title: "Requests",
  robots: { index: false, follow: false },
};

export default function RequestsPage() {
  return (
    <>
      <div className="mt-6">
        <QueueBoard />
      </div>
    </>
  );
}
