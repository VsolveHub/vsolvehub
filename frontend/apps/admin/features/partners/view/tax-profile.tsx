"use client";

import type { Schemas } from "@vsolve/api-client";
import { friendlyErrorMessage } from "@vsolve/query";
import { Badge, Button, Field, Input } from "@vsolve/ui";
import { useState } from "react";

import { useVerifyTaxProfile } from "@/features/partners/queries";

const BUSINESS_TYPE: Record<string, string> = {
  INDIVIDUAL: "Individual",
  WORKFORCE_AGENCY: "Workforce agency",
  PROJECT_VENDOR: "Project vendor",
  EMPLOYER: "Employer",
  RENTAL_OWNER: "Rental owner",
  PROPERTY_HOST: "Property host",
};

/** GSTIN state codes are the first two digits. Exported for tests. */
export function stateCodeFromGstin(gstin: string | null | undefined): string {
  const head = (gstin ?? "").slice(0, 2);
  return /^\d{2}$/.test(head) ? head : "";
}

/**
 * The Partner's business identity and the one decision Operations takes on it: the GSTIN was
 * checked against the GST portal. Invoices carry it only after this.
 */
export function TaxProfileSection({
  partnerId,
  profile,
}: {
  partnerId: string;
  profile: Schemas["PartnerBusinessProfile"] | null | undefined;
}) {
  const verify = useVerifyTaxProfile(partnerId);
  const [stateCode, setStateCode] = useState(
    () => profile?.registered_state_code || stateCodeFromGstin(profile?.gstin),
  );

  if (!profile) {
    return <p className="text-sm text-text-secondary">No business details filled in.</p>;
  }

  const verified = Boolean(profile.gstin_verified_at);
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-text-secondary">Type</dt>
          <dd className="font-medium text-text">{BUSINESS_TYPE[profile.business_type ?? ""] ?? profile.business_type}</dd>
        </div>
        <div>
          <dt className="text-text-secondary">Legal name</dt>
          <dd className="font-medium text-text">{profile.legal_name || "—"}</dd>
        </div>
        <div>
          <dt className="text-text-secondary">GSTIN</dt>
          <dd className="font-medium text-text">
            {profile.gst_registered ? profile.gstin || "Missing" : "Not GST registered"}
          </dd>
        </div>
        <div>
          <dt className="text-text-secondary">Registration no.</dt>
          <dd className="font-medium text-text">{profile.registration_number || "—"}</dd>
        </div>
      </dl>
      {profile.gst_registered && profile.gstin ? (
        verified ? (
          <Badge tone="success">
            GSTIN verified {new Date(profile.gstin_verified_at as string).toLocaleDateString()}
          </Badge>
        ) : (
          <div className="flex flex-wrap items-end gap-2 rounded-card border border-line p-3">
            <p className="w-full text-sm text-text-secondary">
              Check the GSTIN and legal name on the GST portal, then confirm.
            </p>
            <Field label="State code">
              <Input
                value={stateCode}
                maxLength={2}
                inputMode="numeric"
                className="w-20"
                onChange={(event) => setStateCode(event.target.value.replace(/\D/g, ""))}
              />
            </Field>
            <Button loading={verify.isPending} onClick={() => verify.mutate(stateCode)}>
              Mark GSTIN verified
            </Button>
            {verify.isError ? (
              <p role="alert" className="w-full text-sm text-danger-text">
                {friendlyErrorMessage(verify.error)}
              </p>
            ) : null}
          </div>
        )
      ) : null}
    </div>
  );
}
