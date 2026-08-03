"use client";

import { Badge, ErrorState, Spinner } from "@vsolve/ui";

import { useApplicationEditor } from "./application-editor";

import type { OfferableService } from "@/features/catalog/queries";

import { toggle } from "../model/draft";
import { useApplicationReference } from "../reference-queries";
import { SelectableRow } from "./selectable-row";

/**
 * What the applicant does, and which jobs they will accept.
 *
 * Two separate questions on purpose. The trade is how a Partner thinks about
 * themselves; the service variants are what the dispatcher can actually offer
 * them. Merging them into one list would either hide work someone can do or
 * sign them up for jobs they never agreed to.
 *
 * Trades come from `GET /api/v1/partner/skills/` — the canonical set, with real
 * names and descriptions. They used to be derived by walking the public catalog
 * and humanising each `required_skill_code`, which was a request waterfall that
 * could only ever guess the label.
 *
 * Services still come from the catalog, which is where they belong: they are the
 * same bookable variants a customer sees, so a variant Operations deactivates
 * stops being offerable without a frontend change.
 */

export interface WorkStepProps {
  /**
   * Bookable services, read from the public catalog during server rendering.
   *
   * A prop rather than a context read because it is the one input here that is
   * genuinely not per-applicant: it is identical for everyone, needs no session,
   * and is therefore cheaper fetched once on the server than once per browser.
   * The applicant's own answers come from `useApplicationEditor`.
   */
  services: readonly OfferableService[];
}

export function WorkStep({ services }: WorkStepProps) {
  const { draft, update, isReadOnly } = useApplicationEditor();

  const reference = useApplicationReference();

  const byCategory = new Map<string, OfferableService[]>();
  for (const service of services) {
    const bucket = byCategory.get(service.categoryName) ?? [];
    bucket.push(service);
    byCategory.set(service.categoryName, bucket);
  }

  return (
    <div className="flex flex-col gap-8">
      <fieldset className="border-0 p-0">
        <legend className="text-base font-semibold text-text">What kind of work do you do?</legend>
        <p className="mt-1 text-sm text-text-secondary">
          Choose every trade you are qualified for. You can change this later.
        </p>

        {reference.isPending ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-text-secondary">
            <Spinner size="sm" />
            Loading trades…
          </p>
        ) : reference.isError ? (
          <ErrorState
            className="mt-3"
            inline
            title="We could not load the trades"
            message="Nothing you have chosen is lost. Check your connection and try again."
            actionLabel="Try again"
            onAction={reference.refetch}
          />
        ) : reference.skills.length === 0 ? (
          <p className="mt-3 rounded-card border border-line bg-surface p-4 text-sm text-text-secondary">
            No trades are open for applications right now.
          </p>
        ) : (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {reference.skills.map((skill) => (
              <SelectableRow
                key={skill.code}
                checked={draft.skillCodes.includes(skill.code)}
                disabled={isReadOnly}
                onChange={() => update({ skillCodes: toggle(draft.skillCodes, skill.code) })}
                label={skill.name}
                caption={skill.description || undefined}
              />
            ))}
          </div>
        )}
      </fieldset>

      <fieldset className="border-0 p-0">
        <legend className="text-base font-semibold text-text">
          Which jobs will you accept?
        </legend>
        <p className="mt-1 text-sm text-text-secondary">
          You will only be offered jobs you have ticked here.
        </p>

        {services.length === 0 ? (
          <p className="mt-3 rounded-card border border-line bg-surface p-4 text-sm text-text-secondary">
            No services are open for applications right now.
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-5">
            {[...byCategory.entries()].map(([category, categoryServices]) => (
              <div key={category}>
                <h3 className="text-sm font-semibold uppercase tracking-[0.06em] text-text-secondary">
                  {category}
                </h3>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {categoryServices.map((service) => {
                    const needsSkill =
                      service.requiredSkillCode.length > 0 &&
                      !draft.skillCodes.includes(service.requiredSkillCode);

                    return (
                      <div key={service.variantId} className="flex flex-col gap-1">
                        <SelectableRow
                          checked={draft.serviceVariantIds.includes(service.variantId)}
                          disabled={isReadOnly}
                          onChange={() =>
                            update({
                              serviceVariantIds: toggle(
                                draft.serviceVariantIds,
                                service.variantId,
                              ),
                            })
                          }
                          label={service.variantName}
                          caption={service.serviceName}
                        />
                        {/* A hint, not a rule: whether Django requires the
                            matching skill is its decision, not this form's. */}
                        {needsSkill && draft.serviceVariantIds.includes(service.variantId) ? (
                          <Badge tone="warning">
                            Usually needs the {service.requiredSkillCode.replace(/-/g, " ")}{" "}
                            trade above
                          </Badge>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </fieldset>
    </div>
  );
}
