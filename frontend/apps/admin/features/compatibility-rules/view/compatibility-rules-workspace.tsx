"use client";

import { useState } from "react";

import { SplitView } from "@vsolve/ui";
import { ProposeRule } from "@/features/compatibility-rules/view/propose-rule";
import { RuleDetail } from "@/features/compatibility-rules/view/rule-detail";
import { RuleQueue } from "@/features/compatibility-rules/view/rule-queue";

export function CompatibilityRulesWorkspace() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <>
      <div className="mt-6">
        <ProposeRule onProposed={setSelectedId} />
      </div>

      <div className="mt-6">
        <SplitView
          listPane={<RuleQueue selectedId={selectedId} onSelect={setSelectedId} />}
          detailPane={<RuleDetail ruleId={selectedId} />}
          showDetailOnMobile={!!selectedId}
          onBack={() => {
            window.history.back();
            setSelectedId(null);
          }}
        />
      </div>
    </>
  );
}
