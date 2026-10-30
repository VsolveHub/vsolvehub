"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { friendlyErrorMessage } from "@vsolve/query";
import { Button, EmptyState, useT } from "@vsolve/ui";
import { useEffect, useMemo, useState } from "react";

import {
  fetchPartnerDefaultLocation,
  fetchPartnerStayProperties,
  fetchStayTaxonomy,
  stayPropertyTypes,
  type StayTaxonomyVariant,
} from "@/features/stays/queries";
import { useStaySections } from "@/features/stays/view/stay-sections";
import { SectionNav } from "@/features/workspace/view/section-nav";

import { PropertyCard } from "./property-card";
import { PropertyCreateForm } from "./property-create-form";
import { StaySummaryCards } from "./stay-summary-cards";

/**
 * A host's properties, each with its rooms, details, photos and visibility on its own card.
 *
 * The flow is: add a property (type, name, location, photos) → add rooms on its
 * card → publish. Most properties go live at once; a host's first paid-booking
 * property is checked once by Operations. Pausing hides a property without losing
 * anything, and archiving tucks it away — nothing here deletes data.
 */
export function PartnerStaysWorkspace() {
  const t = useT();
  const sections = useStaySections();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [justCreatedId, setJustCreatedId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [defaultLocation, setDefaultLocation] = useState("");

  const taxonomy = useQuery({ queryKey: ["partner-stays", "taxonomy"], queryFn: fetchStayTaxonomy });
  const properties = useQuery({
    queryKey: ["partner-stays", "properties"],
    queryFn: fetchPartnerStayProperties,
  });

  useEffect(() => {
    let cancelled = false;
    void fetchPartnerDefaultLocation().then((location) => {
      if (!cancelled) setDefaultLocation(location);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const propertyTypes = useMemo(() => stayPropertyTypes(taxonomy.data ?? []), [taxonomy.data]);
  const variantById = useMemo(() => {
    const map = new Map<string, StayTaxonomyVariant>();
    for (const type of propertyTypes) map.set(type.variant.id, type.variant);
    return map;
  }, [propertyTypes]);

  const all = properties.data ?? [];
  const current = all.filter((property) => property.listing_status !== "ARCHIVED");
  const archived = all.filter((property) => property.listing_status === "ARCHIVED");
  const showForm = creating || (properties.isSuccess && all.length === 0);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-action">
            {t("stays.workspace.eyebrow")}
          </p>
          <h1 className="mt-1 text-2xl font-extrabold text-navy-900">{t("stays.workspace.heading")}</h1>
          <p className="mt-1 text-sm text-text-secondary">
            {t("stays.workspace.intro")}
          </p>
        </div>
        {!showForm ? <Button onClick={() => setCreating(true)}>{t("stays.workspace.addProperty")}</Button> : null}
      </div>

      <SectionNav label={t("stays.sections.ariaLabel")} items={sections} />

      {properties.isSuccess && all.length > 0 ? <StaySummaryCards /> : null}

      {showForm ? (
        <PropertyCreateForm
          propertyTypes={propertyTypes}
          defaultLocation={defaultLocation}
          onCancel={all.length > 0 ? () => setCreating(false) : undefined}
          onCreated={(created) => {
            setCreating(false);
            setJustCreatedId(created.id);
            void qc.invalidateQueries({ queryKey: ["partner-stays"] });
          }}
        />
      ) : null}

      {taxonomy.error ? (
        <p className="text-sm text-danger-text">{friendlyErrorMessage(taxonomy.error)}</p>
      ) : null}
      {properties.isLoading ? <p className="text-sm text-text-secondary">{t("common.loading")}</p> : null}
      {properties.error ? (
        <p className="text-sm text-danger-text">{friendlyErrorMessage(properties.error)}</p>
      ) : null}

      {current.length > 0 ? (
        <ul className="flex flex-col gap-4">
          {current.map((property) => (
            <li key={property.id}>
              <PropertyCard
                property={property}
                variant={variantById.get(property.variant)}
                initialPanel={property.id === justCreatedId ? "rooms" : null}
              />
            </li>
          ))}
        </ul>
      ) : properties.isSuccess && all.length > 0 ? (
        <EmptyState
          compact
          title={t("stays.workspace.noActiveTitle")}
          description={t("stays.workspace.noActiveDescription")}
        />
      ) : null}

      {archived.length > 0 ? (
        <section className="flex flex-col gap-3">
          <button
            type="button"
            className="self-start text-sm font-semibold text-text-link"
            onClick={() => setShowArchived((open) => !open)}
            aria-expanded={showArchived}
          >
            {showArchived
              ? t("stays.workspace.hideArchived", { n: archived.length })
              : t("stays.workspace.showArchived", { n: archived.length })}
          </button>
          {showArchived ? (
            <ul className="flex flex-col gap-4">
              {archived.map((property) => (
                <li key={property.id}>
                  <PropertyCard property={property} variant={variantById.get(property.variant)} />
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
