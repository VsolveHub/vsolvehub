"use client";

import { Button, ErrorState, buttonStyles, useT } from "@vsolve/ui";
import { describeError, isStageTransitionNotAllowed } from "@vsolve/query";

import { Pictogram } from "@/components/pictogram";
import type { Engagement } from "@/features/engagement/queries";

import { useConfirmShiftArrival, type ShiftCommandScope, type ShiftDay } from "../queries";
import { DAY_ONE_EARNS_FEE } from "../model/shift-copy";

/**
 * Day of, before arrival — where to go, who is going, one tap when there.
 *
 * Non-OTP arrival is the ordinary path in M2, not a fallback: a person who was
 * there says so and the server stamps the time. On day one that same tap earns
 * Vsolve's booking fee, so the button reports nothing until the server answers.
 *
 * The address and phone come off the engagement (`site_address`,
 * `customer_contact`), released once the fee is verified; until then the block
 * says so rather than showing an empty card.
 */

export interface MorningPhaseProps {
  readonly day: ShiftDay;
  readonly scope: ShiftCommandScope;
  readonly canConfirm: boolean;
  readonly engagement: Engagement | null;
}

export function addressLine(address: Engagement["site_address"]): string {
  if (address === null) return "";
  return [address.line1, address.line2, address.landmark, address.locality, address.city]
    .map((part) => part.trim())
    .filter((part) => part !== "")
    .join(", ");
}

/** The server's route to the Customer's pin; a search for the text only if it sent none. */
export function mapsHref(address: Engagement["site_address"]): string {
  if (address?.directions_url) return address.directions_url;
  const query = [addressLine(address), address?.postal_code ?? ""].filter((part) => part !== "").join(" ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function SiteRow({ engagement }: { readonly engagement: Engagement | null }) {
  const t = useT();
  const address = engagement?.site_address ?? null;
  const contact = engagement?.customer_contact ?? null;
  const line = addressLine(address);

  if (line === "" && contact === null) {
    return <p className="text-sm text-text-secondary">{t("work.morning.addressLocked")}</p>;
  }

  return (
    <div className="flex items-center gap-2">
      <Pictogram name="site" size="sm" className="shrink-0 text-text-muted" />
      <p className="min-w-0 flex-1 truncate text-sm font-semibold text-text">{line === "" ? t("work.morning.addressPending") : line}</p>
      {line === "" ? null : (
        <a href={mapsHref(address)} target="_blank" rel="noreferrer" className={buttonStyles({ variant: "outline", size: "sm" })}>
          {t("work.engagementJob.map")}
        </a>
      )}
      {contact === null || contact.phone.trim() === "" ? null : (
        <a href={`tel:${contact.phone}`} className={buttonStyles({ variant: "outline", size: "sm" })}>
          <Pictogram name="call" size="xs" />
          {t("work.engagementJob.call")}
        </a>
      )}
    </div>
  );
}

export function MorningPhase({ day, scope, canConfirm, engagement }: MorningPhaseProps) {
  const t = useT();
  const confirm = useConfirmShiftArrival(scope);
  const names = day.crew.map((member) => member.display_name).join(", ");

  return (
    <section className="flex flex-col gap-4" aria-labelledby="morning-heading">
      <h2 id="morning-heading" className="sr-only">
        {t("work.morning.srHeading")}
      </h2>

      <SiteRow engagement={engagement} />

      <p className="text-sm text-text-secondary">
        <span className="font-semibold text-text">{t("work.morning.crewLabel")}</span> {names}
      </p>

      {canConfirm ? (
        <Button
          type="button"
          block
          size="lg"
          onClick={() => confirm.mutate()}
          loading={confirm.isPending}
          loadingLabel={t("work.settlement.recording")}
          disabled={confirm.isPending}
          icon={<Pictogram name="go" size="sm" />}
        >
          {t("work.morning.reached")}
        </Button>
      ) : (
        <p className="text-sm text-text-secondary">{t("work.morning.cannotConfirm")}</p>
      )}

      {day.position === 1 ? <p className="text-xs text-text-muted">{t(DAY_ONE_EARNS_FEE)}</p> : null}

      {confirm.isError ? <ArrivalFailure error={confirm.error} /> : null}
    </section>
  );
}

function ArrivalFailure({ error }: { readonly error: unknown }) {
  const t = useT();
  const presentation = describeError(error, "mutation");
  if (isStageTransitionNotAllowed(error)) {
    return (
      <ErrorState
        title={t("work.morning.notReady.title")}
        message={t("work.morning.notReady.message")}
        severity="warning"
        reference={presentation.reference}
      />
    );
  }
  return (
    <ErrorState
      title={presentation.title}
      message={presentation.message}
      severity={presentation.severity}
      reference={presentation.reference}
    />
  );
}
