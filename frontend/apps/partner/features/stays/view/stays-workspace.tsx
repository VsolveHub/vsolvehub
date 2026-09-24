"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Card, EmptyState, Field, Input, Select, Textarea, formatMoney } from "@vsolve/ui";
import { useState, type FormEvent } from "react";

import { usePartnerCapabilities } from "@/features/capability/queries";
import {
  createPartnerStayProperty,
  fetchPartnerStayEnquiries,
  fetchPartnerStayProperties,
  respondPartnerStayEnquiry,
  stayVariantChoices,
  submitPartnerStayProperty,
} from "@/features/stays/queries";

export function PartnerStaysWorkspace() {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [variantId, setVariantId] = useState("");
  const [location, setLocation] = useState("");
  const [nightlyRate, setNightlyRate] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [responses, setResponses] = useState<Record<string, string>>({});

  const capabilities = usePartnerCapabilities();
  const variants = stayVariantChoices(capabilities.data?.capabilities);
  const properties = useQuery({
    queryKey: ["partner-stays", "properties"],
    queryFn: fetchPartnerStayProperties,
  });
  const enquiries = useQuery({
    queryKey: ["partner-stays", "enquiries"],
    queryFn: fetchPartnerStayEnquiries,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["partner-stays"] });
  };

  const create = useMutation({
    mutationFn: createPartnerStayProperty,
    onSuccess: () => {
      setTitle("");
      setVariantId("");
      setLocation("");
      setNightlyRate("");
      setFormError(null);
      invalidate();
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const submit = useMutation({
    mutationFn: submitPartnerStayProperty,
    onSuccess: invalidate,
  });

  const respond = useMutation({
    mutationFn: ({ id, response }: { id: string; response: string }) =>
      respondPartnerStayEnquiry(id, response),
    onSuccess: (_data, vars) => {
      setResponses((current) => ({ ...current, [vars.id]: "" }));
      invalidate();
    },
  });

  function onCreate(event: FormEvent) {
    event.preventDefault();
    const nightly = Number(nightlyRate);
    if (!variantId || !title.trim() || !Number.isInteger(nightly) || nightly < 1) {
      setFormError("Choose a variant, a title, and a nightly rate in paise.");
      return;
    }
    setFormError(null);
    create.mutate({
      variant_id: variantId,
      title: title.trim(),
      location_text: location.trim(),
      nightly_rate_paise: nightly,
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
      <h1 className="text-xl font-bold text-navy-900">Stays</h1>
      <Card>
        <h2 className="mb-3 text-base font-semibold text-navy-900">Properties</h2>
        <form className="mb-4 flex flex-col gap-3" onSubmit={onCreate}>
          <Field label="Variant">
            <Select id="stay-variant" value={variantId} onChange={(e) => setVariantId(e.target.value)}>
              <option value="">Select a variant</option>
              {variants.map((variant) => (
                <option key={variant.id} value={variant.id}>
                  {variant.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Title">
            <Input id="stay-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Location">
            <Input id="stay-location" value={location} onChange={(e) => setLocation(e.target.value)} />
          </Field>
          <Field label="Nightly rate (paise)">
            <Input
              id="stay-rate"
              inputMode="numeric"
              value={nightlyRate}
              onChange={(e) => setNightlyRate(e.target.value)}
            />
          </Field>
          {formError ? <p className="text-sm text-danger-text">{formError}</p> : null}
          <Button type="submit" disabled={create.isPending}>
            Add property
          </Button>
        </form>
        {properties.isLoading ? <p className="text-sm text-text-secondary">Loading…</p> : null}
        {properties.error ? (
          <p className="text-sm text-danger-text">{(properties.error as Error).message}</p>
        ) : null}
        {properties.data && properties.data.length === 0 ? (
          <EmptyState compact title="No properties yet" description="Add a property to take enquiries." />
        ) : null}
        <ul className="flex flex-col gap-3">
          {properties.data?.map((property) => {
            const nightly = property.units?.[0]?.nightly_rate_paise;
            const canSubmit =
              property.moderation_status === "DRAFT" || property.moderation_status === "REJECTED";
            return (
              <li key={property.id} className="rounded-card border border-line p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-navy-900">{property.title}</p>
                    <p className="text-sm text-text-secondary">
                      {property.location_text || "Location not set"}
                      {typeof nightly === "number" ? ` · ${formatMoney(nightly)} / night` : ""}
                    </p>
                  </div>
                  <Badge>{property.public_state}</Badge>
                </div>
                {canSubmit ? (
                  <div className="mt-3">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={submit.isPending}
                      onClick={() => submit.mutate(property.id)}
                    >
                      Submit for review
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <h2 className="mb-3 text-base font-semibold text-navy-900">Enquiries</h2>
        {enquiries.isLoading ? <p className="text-sm text-text-secondary">Loading…</p> : null}
        {enquiries.error ? (
          <p className="text-sm text-danger-text">{(enquiries.error as Error).message}</p>
        ) : null}
        {enquiries.data && enquiries.data.length === 0 ? (
          <EmptyState compact title="No enquiries yet" description="Guest questions show up here." />
        ) : null}
        <ul className="flex flex-col gap-3">
          {enquiries.data?.map((enquiry) => {
            const draft = responses[enquiry.id] ?? "";
            return (
              <li key={enquiry.id} className="rounded-card border border-line p-3">
                <p className="font-semibold text-navy-900">{enquiry.property_title}</p>
                <p className="text-sm text-text-secondary">
                  {enquiry.status} · {enquiry.check_in} – {enquiry.check_out}
                  {typeof enquiry.total_quote_paise === "number"
                    ? ` · ${formatMoney(enquiry.total_quote_paise)}`
                    : ""}
                </p>
                {enquiry.message ? <p className="mt-2 text-sm">{enquiry.message}</p> : null}
                {enquiry.status === "SUBMITTED" ? (
                  <form
                    className="mt-3 flex flex-col gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (!draft.trim()) return;
                      respond.mutate({ id: enquiry.id, response: draft.trim() });
                    }}
                  >
                    <Field label="Your response">
                      <Textarea
                        id={`enquiry-${enquiry.id}`}
                        value={draft}
                        onChange={(e) =>
                          setResponses((current) => ({ ...current, [enquiry.id]: e.target.value }))
                        }
                      />
                    </Field>
                    <Button type="submit" size="sm" disabled={respond.isPending || !draft.trim()}>
                      Respond
                    </Button>
                  </form>
                ) : enquiry.host_response ? (
                  <p className="mt-2 text-sm">{enquiry.host_response}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
