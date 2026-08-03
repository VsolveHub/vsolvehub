"use client";

import type { Schemas } from "@vsolve/api-client";
import { useEffect } from "react";

import type { VariantRules } from "../model/state";
import type { TaskOption } from "./task-picker";
import { BookingWorkspace } from "./workspace";
import { WorkspaceProvider, useWorkspace } from "./workspace-context";

/**
 * Feeds the server-rendered variant configuration into the machine.
 *
 * The page is a Server Component and fetches the configuration during render;
 * the reducer is client state. This is the seam between them, kept as its own
 * component so `BookingWorkspace` never has to care whether configuration has
 * arrived — by the time it renders, it has.
 */

function toRules(
  variant: Schemas["ServiceVariantConfiguration"],
  tasks: readonly TaskOption[],
): VariantRules {
  return {
    variantId: variant.id,
    variantCode: variant.code,
    requiredQuestionCodes: variant.questions
      .filter((question) => question.is_required)
      .map((question) => question.code),
    availableTaskCodes: tasks.map((task) => task.code),
  };
}

function Configure({
  variant,
  tasks,
}: {
  variant: Schemas["ServiceVariantConfiguration"];
  tasks: readonly TaskOption[];
}) {
  const { dispatch } = useWorkspace();
  const rules = toRules(variant, tasks);

  useEffect(() => {
    dispatch({ type: "CONFIGURE", rules });
    // `rules` is derived fresh each render; the variant id is what actually
    // changes, so it is the dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant.id, dispatch]);

  return null;
}

export interface BookingWorkspacePageProps {
  service: Schemas["ServiceDetail"];
  variant: Schemas["ServiceVariantConfiguration"];
  /**
   * Task rates for this variant.
   *
   * Supplied by the page rather than read from `variant` because the published
   * contract carries no task rates yet — see proposal 0003 §A3. When it does,
   * this prop disappears and `toRules` reads the variant directly.
   */
  tasks: readonly TaskOption[];
  /** Minimum service subtotal in paise, or null while unpublished. */
  minimumSubtotalPaise: number | null;
}

export function BookingWorkspaceBoot({
  service,
  variant,
  tasks,
  minimumSubtotalPaise,
}: BookingWorkspacePageProps) {
  return (
    <WorkspaceProvider serviceSlug={service.slug} initialStage="scope">
      <Configure variant={variant} tasks={tasks} />
      <BookingWorkspace
        service={service}
        variant={variant}
        tasks={tasks}
        minimumSubtotalPaise={minimumSubtotalPaise}
      />
    </WorkspaceProvider>
  );
}
