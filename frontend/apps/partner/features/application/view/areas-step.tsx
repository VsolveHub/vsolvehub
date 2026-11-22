"use client";

import { useState } from "react";
import {
  canContinueStep3,
  isValidPin,
  matchPin,
  normalisePin,
  MAX_REQUESTED_PINS,
} from "@vsolve/query";
import { Badge, Button, ErrorState, Spinner, useT } from "@vsolve/ui";
import { Check, Plus, X } from "lucide-react";

import { toggle } from "../model/draft";
import { useApplicationReference } from "../reference-queries";
import { useApplicationEditor, useProceedDisabled } from "./application-editor";
import { SelectableRow } from "./selectable-row";

export function AreasStep() {
  const t = useT();
  const { draft, update, application, isReadOnly } = useApplicationEditor();
  const reference = useApplicationReference();

  const [inputPin, setInputPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [matchedNotice, setMatchedNotice] = useState<string | null>(null);
  const [isExpandOpen, setIsExpandOpen] = useState(false);

  const canContinue = canContinueStep3(draft.serviceAreaIds, draft.requestedPostalCodes);
  useProceedDisabled(!canContinue);

  if (reference.isPending) {
    return (
      <p className="flex items-center gap-2 py-8 text-sm text-text-secondary">
        <Spinner size="sm" />
        {t("apply.areas.loading")}
      </p>
    );
  }

  if (reference.isError) {
    return (
      <ErrorState
        title={t("apply.areas.loadError.title")}
        message={t("apply.common.checkConnectionAndRetry")}
        actionLabel={t("common.tryAgain")}
        onAction={reference.refetch}
      />
    );
  }

  function handleAddPin() {
    const pin = normalisePin(inputPin);
    setMatchedNotice(null);
    if (!isValidPin(pin)) {
      setPinError(t("apply.areas.pinInvalid"));
      return;
    }
    setPinError(null);

    // Check device match against open areas
    const result = matchPin(reference.serviceAreas, pin);
    if (result.kind === "open" && result.areas.length > 0) {
      // A PIN can sit in more than one area: tick every one of them.
      const toTick = result.areas
        .map((area) => area.id)
        .filter((id) => !draft.serviceAreaIds.includes(id));
      if (toTick.length > 0) {
        update({ serviceAreaIds: [...draft.serviceAreaIds, ...toTick] });
      }
      setMatchedNotice(
        t("apply.areas.pinMatchedNotice", {
          pin,
          area: result.areas.map((area) => area.name).join(", "),
        }),
      );
      setInputPin("");
      return;
    }

    if (draft.requestedPostalCodes.includes(pin)) {
      setPinError(t("apply.areas.pinAlreadyAdded"));
      return;
    }
    if (draft.requestedPostalCodes.length >= MAX_REQUESTED_PINS) {
      setPinError(t("apply.areas.pinMaxReached"));
      return;
    }

    update({ requestedPostalCodes: [...draft.requestedPostalCodes, pin] });
    setInputPin("");
  }

  function handleRemovePin(pin: string) {
    update({
      requestedPostalCodes: draft.requestedPostalCodes.filter((p) => p !== pin),
    });
  }

  function handleTickReadyArea(pin: string, areaId: string) {
    const nextAreas = draft.serviceAreaIds.includes(areaId)
      ? draft.serviceAreaIds
      : [...draft.serviceAreaIds, areaId];
    update({
      serviceAreaIds: nextAreas,
      requestedPostalCodes: draft.requestedPostalCodes.filter((p) => p !== pin),
    });
  }

  const requestedPinsList = draft.requestedPostalCodes;
  const areaRequests = application?.area_requests ?? [];

  // Case F: 0 open areas in system
  if (reference.serviceAreas.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <div
          role="status"
          className="rounded-control border border-info-line bg-info-surface p-4 text-sm text-info-text"
        >
          {t("apply.areas.zeroAreasNotice")}
        </div>

        <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
          <label htmlFor="area-pin-input" className="text-xs font-semibold text-text-secondary">
            {t("apply.areas.notListedHint")}
          </label>
          <div className="flex gap-2">
            <input
              id="area-pin-input"
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={inputPin}
              disabled={isReadOnly}
              onChange={(e) => {
                setInputPin(e.target.value);
                setPinError(null);
              }}
              placeholder={t("apply.areas.pinPlaceholder")}
              className="w-44 rounded-control border border-line bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-action focus:outline-none"
            />
            <Button
              type="button"
              variant="outline"
              disabled={isReadOnly || inputPin.trim().length === 0}
              onClick={handleAddPin}
            >
              <Plus size={14} className="mr-1" />
              {t("apply.areas.addPin")}
            </Button>
          </div>
          {pinError ? (
            <p className="text-xs font-semibold text-danger-text">{pinError}</p>
          ) : null}
        </div>

        {requestedPinsList.length > 0 ? (
          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-text-secondary">
              {t("apply.statusBanner.requestedPinsTitle")}
            </h3>
            <div className="flex flex-wrap gap-2">
              {requestedPinsList.map((pin) => (
                <span
                  key={pin}
                  className="inline-flex items-center gap-1.5 rounded-control border border-line bg-surface px-3 py-1.5 text-xs font-mono text-text shadow-xs"
                >
                  <span>{pin}</span>
                  {!isReadOnly && (
                    <button
                      type="button"
                      onClick={() => handleRemovePin(pin)}
                      aria-label={t("apply.areas.removePin", { pin })}
                      className="ml-1 text-text-muted hover:text-danger-text"
                    >
                      <X size={14} />
                    </button>
                  )}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  const allAreaIds = reference.serviceAreas.map((a) => a.id);
  const allSelected =
    allAreaIds.length > 0 && allAreaIds.every((id) => draft.serviceAreaIds.includes(id));

  return (
    <fieldset className="border-0 p-0 flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <legend className="text-sm font-bold text-navy-900">
          {t("apply.areas.legend")} <span className="text-danger-text">*</span>
        </legend>

        {!isReadOnly && reference.serviceAreas.length > 1 && (
          <button
            type="button"
            onClick={() => {
              if (allSelected) {
                update({ serviceAreaIds: [] });
              } else {
                update({ serviceAreaIds: allAreaIds });
              }
            }}
            className="text-xs font-semibold text-navy-700 hover:text-signal-700"
          >
            {allSelected ? t("apply.areas.deselectAll") : t("apply.areas.selectAll")}
          </button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {reference.serviceAreas.map((area) => (
          <SelectableRow
            key={area.id}
            checked={draft.serviceAreaIds.includes(area.id)}
            disabled={isReadOnly}
            onChange={() =>
              update({ serviceAreaIds: toggle(draft.serviceAreaIds, area.id) })
            }
            label={area.name}
          />
        ))}
      </div>

      {matchedNotice ? (
        <div
          role="status"
          className="flex items-center gap-2 rounded-control border border-success-line bg-success-surface p-3 text-xs font-semibold text-success-text"
        >
          <Check size={14} className="shrink-0" />
          <span>{matchedNotice}</span>
        </div>
      ) : null}

      {/* Expandable "My area is not listed" */}
      <div className="rounded-card border border-line bg-surface p-4 flex flex-col gap-3">
        {!isExpandOpen ? (
          <button
            type="button"
            disabled={isReadOnly}
            onClick={() => setIsExpandOpen(true)}
            className="flex items-center gap-2 text-xs font-bold text-navy-800 hover:text-signal-700 self-start"
          >
            <Plus size={14} />
            {t("apply.areas.notListedButton")}
          </button>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-navy-900">
                {t("apply.areas.notListedButton")}
              </span>
              <button
                type="button"
                onClick={() => {
                  setIsExpandOpen(false);
                  setPinError(null);
                }}
                className="text-xs text-text-muted hover:text-text"
              >
                {t("common.cancel")}
              </button>
            </div>
            <p className="text-xs text-text-secondary">{t("apply.areas.notListedHint")}</p>
            <div className="flex gap-2">
              <input
                id="area-pin-input-expand"
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={inputPin}
                disabled={isReadOnly}
                onChange={(e) => {
                  setInputPin(e.target.value);
                  setPinError(null);
                }}
                placeholder={t("apply.areas.pinPlaceholder")}
                className="w-44 rounded-control border border-line bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-action focus:outline-none"
              />
              <Button
                type="button"
                variant="outline"
                disabled={isReadOnly || inputPin.trim().length === 0}
                onClick={handleAddPin}
              >
                <Plus size={14} className="mr-1" />
                {t("apply.areas.addPin")}
              </Button>
            </div>
            {pinError ? (
              <p className="text-xs font-semibold text-danger-text">{pinError}</p>
            ) : null}
          </div>
        )}

        {/* Requested PINs chips */}
        {requestedPinsList.length > 0 ? (
          <div className="flex flex-col gap-2 pt-2 border-t border-line">
            <span className="text-xs font-semibold text-text-secondary">
              {t("apply.statusBanner.requestedPinsTitle")} ({requestedPinsList.length}/{MAX_REQUESTED_PINS})
            </span>
            <div className="flex flex-wrap gap-2">
              {requestedPinsList.map((pin) => {
                const req = areaRequests.find((r) => r.postal_code === pin);
                return (
                  <div
                    key={pin}
                    className="inline-flex items-center gap-2 rounded-control border border-line bg-surface-subtle px-3 py-1.5 text-xs text-text shadow-xs"
                  >
                    <span className="font-mono font-bold">{pin}</span>

                    {/* Server status badge if known, else neutral "Noted" */}
                    {req?.status === "READY" && req.covering_area_id ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Badge tone="success">
                          {t("apply.areas.pinReady", {
                            area: req.covering_area_name ?? "",
                          })}
                        </Badge>
                        {!isReadOnly && (
                          <button
                            type="button"
                            onClick={() =>
                              handleTickReadyArea(pin, req.covering_area_id!)
                            }
                            className="font-semibold text-action underline hover:text-action-hover"
                          >
                            {t("apply.areas.pinTickIt")}
                          </button>
                        )}
                      </span>
                    ) : req?.status === "AREA_FULL" ? (
                      <Badge tone="warning">{t("apply.areas.pinAreaFull")}</Badge>
                    ) : req?.status === "WAITING" ? (
                      <Badge tone="neutral">{t("apply.areas.pinWaiting")}</Badge>
                    ) : (
                      <span className="text-[11px] text-text-muted">
                        {t("apply.areas.pinNotedNotice", { pin })}
                      </span>
                    )}

                    {!isReadOnly && (
                      <button
                        type="button"
                        onClick={() => handleRemovePin(pin)}
                        aria-label={t("apply.areas.removePin", { pin })}
                        className="ml-1 text-text-muted hover:text-danger-text"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      {!canContinue && (
        <p className="text-xs font-semibold text-danger-text mt-1">
          {t("apply.areas.selectOrRequest")}
        </p>
      )}
    </fieldset>
  );
}
