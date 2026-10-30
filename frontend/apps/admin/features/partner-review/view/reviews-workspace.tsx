"use client";

import { useState, useEffect } from "react";

import { SplitView } from "@vsolve/ui";
import { ReviewDetail } from "@/features/partner-review/view/review-detail";
import { ReviewQueue } from "@/features/partner-review/view/review-queue";

export function ReviewsWorkspace() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const onPopState = () => {
      if (selectedId) setSelectedId(null);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [selectedId]);

  const handleSelect = (id: string) => {
    // One entry for "a detail is open", not one per application: switching between applications
    // used to stack entries, so Back stepped through them before it would close the detail.
    if (selectedId === null) {
      window.history.pushState({ detailOpen: true }, "", window.location.href);
    }
    setSelectedId(id);
  };

  return (
    <SplitView
      className="min-h-0 flex-1"
      listPaneWidth="lg:w-84 xl:w-[26rem]"
      listPane={<ReviewQueue selectedId={selectedId} onSelect={handleSelect} />}
      detailPane={<ReviewDetail applicationId={selectedId} />}
      showDetailOnMobile={!!selectedId}
      onBack={() => {
        window.history.back();
        setSelectedId(null);
      }}
      mobileDetailTitle="Partner application"
    />
  );
}

