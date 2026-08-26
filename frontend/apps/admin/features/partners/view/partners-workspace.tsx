"use client";

import { useEffect, useRef, useState } from "react";

import { SplitView } from "@vsolve/ui";
import { PartnerDirectory } from "@/features/partners/view/partner-directory";
import { PartnerRecord } from "@/features/partners/view/partner-record";
import type { PartnerDirectoryFilters } from "@/features/partners/queries";

export function PartnersWorkspace() {
  const [filters, setFilters] = useState<PartnerDirectoryFilters>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    const onPopState = () => {
      if (selectedIdRef.current !== null) {
        setSelectedId(null);
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const handleSelect = (id: string) => {
    setSelectedId((current) => {
      if (current === null) {
        window.history.pushState({ detailOpen: true }, "", window.location.href);
      }
      return id;
    });
  };

  return (
    <SplitView
      className="min-h-0 flex-1"
      listPaneWidth="sm:w-[22rem] lg:w-[28rem]"
      listPane={
        <PartnerDirectory
          filters={filters}
          onFiltersChange={setFilters}
          selectedId={selectedId}
          onSelect={handleSelect}
        />
      }
      detailPane={<PartnerRecord partnerId={selectedId} />}
      showDetailOnMobile={selectedId !== null}
      onBack={() => window.history.back()}
      mobileDetailTitle="Partners"
    />
  );
}
