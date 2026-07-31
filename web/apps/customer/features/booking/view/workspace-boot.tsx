"use client";

import type { Schemas } from "@vsolve/api-client";
import { useEffect } from "react";

import type { VariantRules } from "../model/state";
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

function toRules(variant: Schemas["ServiceVariantConfiguration"]): VariantRules {
  return {
    variantId: variant.id,
    variantCode: variant.code,
    minimumDurationMinutes: variant.minimum_duration_minutes,
    maximumDurationMinutes: variant.maximum_duration_minutes,
    durationIncrementMinutes: variant.duration_increment_minutes,
    recommendedDurationMinutes: variant.recommended_duration_minutes,
    requiredQuestionCodes: variant.questions
      .filter((question) => question.is_required)
      .map((question) => question.code),
  };
}

function Configure({ variant }: { variant: Schemas["ServiceVariantConfiguration"] }) {
  const { dispatch } = useWorkspace();
  const rules = toRules(variant);

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
}

export function BookingWorkspaceBoot({ service, variant }: BookingWorkspacePageProps) {
  return (
    <WorkspaceProvider serviceSlug={service.slug}>
      <Configure variant={variant} />
      <BookingWorkspace service={service} variant={variant} />
    </WorkspaceProvider>
  );
}
