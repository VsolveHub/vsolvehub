"use client";

import Link from "next/link";

import { WORKFORCE_WORKSPACE } from "@/features/workspace/registry";
import { WorkspaceRoute } from "@/features/workspace/view/workspace-route";

import { CrewOfferList } from "./crew-offer-list";

/**
 * The client half of the crew-offer route.
 *
 * Same split, and the same two reasons, as `enquiry-screens.tsx`:
 * `WorkspaceRoute` takes a render function, which cannot cross the
 * server-to-client boundary — and a `"use client"` route file silently loses
 * `export const dynamic` and `metadata`, which is how an authenticated page ends
 * up prerendered as static, indexable HTML.
 *
 * ## Authorized by the actions, and reached through the registry
 *
 * `enquiry.view` gates the route and `enquiry.accept` is what the controls need;
 * both are published for `A3_TIME_BLOCK` in `partners.capabilities`. The
 * destination itself lives in `WORKSPACE_REGISTRY` rather than being linked from
 * anywhere by hand, so a lead reaches it from their own workspace and an
 * unknown workspace key still renders nothing.
 *
 * The roster route is read off the **resolved workspace** rather than written as
 * a literal, for the reason `registry.ts` states about profession names: routes
 * are composed from the workspace's own `home`, never from a lifecycle label.
 */
export function CrewOfferScreen() {
  return (
    <WorkspaceRoute
      workspaceKey={WORKFORCE_WORKSPACE}
      actions={["enquiry.view", "enquiry.accept", "enquiry.decline"]}
    >
      {(workspace) => (
        <>
          <header>
            <h1 className="text-xl font-semibold text-text">Crew offers</h1>
            <p className="mt-1 text-sm leading-6 text-text-secondary">
              Day-rate jobs at a price Vsolve has already published. Nothing to quote — take it or
              pass, and the first lead to answer gets it.
            </p>
          </header>

          <CrewOfferList crewHref={`${workspace.home}/crew`} />

          {/*
            The quote flow is the thin-supply fallback under ADR-0009, not a dead
            surface — some requests have no published rate for the city and skill
            and fall back to it. Named here so a lead who has answered every offer
            knows where the rest of their work is, rather than concluding the app
            has two inboxes for no reason.
          */}
          <p className="text-sm leading-6 text-text-secondary">
            Some jobs still come as a request to quote — Vsolve has no published day rate for that
            city and skill yet. Those arrive under{" "}
            <Link
              href={`${workspace.home}/enquiries`}
              className="font-semibold text-text underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
            >
              Enquiries
            </Link>
            .
          </p>
        </>
      )}
    </WorkspaceRoute>
  );
}
