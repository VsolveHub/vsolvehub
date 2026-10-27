"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { friendlyErrorMessage } from "@vsolve/query";
import { Button, Field, Input, Sheet, cn, useT } from "@vsolve/ui";
import { BedDouble, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";

import { addPartnerStayRoom, byRoomNumber, type StayLook, type StayUnit } from "@/features/stays/queries";
import { RoomPhotosDraft } from "./room-photos";

const NEW = "__new__";

type Translate = ReturnType<typeof useT>;

/** "Same as 101, 102, 103". */
export function sameAsLabel(numbers: string[], t: Translate): string {
  if (numbers.length === 0) return t("stays.addRoom.noRoomsYet");
  const shown = numbers.slice(0, 4).join(", ");
  const rooms = `${shown}${numbers.length > 4 ? ` +${numbers.length - 4}` : ""}`;
  return t("stays.addRoom.sameAs", { rooms });
}

/** What adding this room does to the guest cards, in one line. */
export function addRoomOutcome(
  choice: string,
  looks: StayLook[],
  unitName: string,
  t: Translate,
): string {
  if (choice === NEW) return t("stays.addRoom.outcomeNew", { name: unitName });
  const look = looks.find((l) => l.id === choice);
  const title = look?.display_name || unitName;
  return t("stays.addRoom.outcomeJoins", { title });
}

/**
 * Add one room to a room type, and say how it looks.
 *
 * The host picks an existing look ("Same as 101, 102, 103") to reuse its photos, or starts a
 * new look with its own name and photos. The line at the bottom says what guests will see.
 */
export function AddRoomSheet({
  unit,
  open,
  onOpenChange,
}: {
  unit: StayUnit;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const looks = [...(unit.looks ?? [])].sort((a, b) => a.display_order - b.display_order);
  const rooms = [...(unit.rooms ?? [])].sort(byRoomNumber);
  const [number, setNumber] = useState("");
  const [choice, setChoice] = useState<string>(looks[0]?.id ?? NEW);
  const [lookName, setLookName] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setNumber("");
    setChoice(looks[0]?.id ?? NEW);
    setLookName("");
    setPhotos([]);
    setError(null);
  };

  const add = useMutation({
    mutationFn: () =>
      addPartnerStayRoom(unit.id, {
        number: number.trim(),
        ...(choice === NEW
          ? { new_look: { name: lookName.trim(), image_urls: photos } }
          : { look_id: choice }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["partner-stays"] });
      reset();
      onOpenChange(false);
    },
    onError: (err: unknown) => setError(friendlyErrorMessage(err)),
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!number.trim()) return setError(t("stays.addRoom.numberMissing"));
    if (choice === NEW && !lookName.trim()) {
      return setError(t("stays.addRoom.lookNameMissing"));
    }
    setError(null);
    add.mutate();
  }

  const options = [
    ...looks.map((look) => ({
      id: look.id,
      title: look.name || t("stays.addRoom.mainLook", { name: unit.name }),
      caption: sameAsLabel(
        rooms.filter((r) => r.look === look.id).map((r) => r.number),
        t,
      ),
      cover: look.media[0]?.url,
    })),
    {
      id: NEW,
      title: t("stays.addRoom.newLook"),
      caption: t("stays.addRoom.differentPhotos"),
      cover: undefined,
    },
  ];

  return (
    <Sheet
      side="end"
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
      title={t("stays.addRoom.title", { name: unit.name })}
      description={t("stays.addRoom.description")}
      footer={
        <>
          <Button variant="ghost" disabled={add.isPending} onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" form={`add-room-${unit.id}`} loading={add.isPending}>
            {number.trim()
              ? t("stays.addRoom.submitNumbered", { number: number.trim() })
              : t("stays.addRoom.submit")}
          </Button>
        </>
      }
    >
      <form id={`add-room-${unit.id}`} className="flex flex-col gap-5 py-3" onSubmit={onSubmit} noValidate>
        <Field label={t("stays.addRoom.numberLabel")} required>
          <Input
            value={number}
            maxLength={40}
            placeholder={t("stays.addRoom.numberPlaceholder")}
            onChange={(event) => setNumber(event.target.value)}
          />
        </Field>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-bold text-navy-900">{t("stays.addRoom.lookLegend")}</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {options.map((option) => {
              const on = choice === option.id;
              return (
                <label
                  key={option.id}
                  className={cn(
                    "flex cursor-pointer flex-col overflow-hidden rounded-card border bg-surface text-left",
                    on ? "border-navy-900 ring-2 ring-navy-900" : "border-line hover:border-line-strong",
                  )}
                >
                  <input
                    type="radio"
                    name={`look-choice-${unit.id}`}
                    className="sr-only"
                    checked={on}
                    onChange={() => setChoice(option.id)}
                  />
                  <span className="relative block aspect-[4/3] bg-surface-sunken">
                    {option.cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={option.cover} alt="" className="absolute inset-0 size-full object-cover" />
                    ) : option.id === NEW ? (
                      <Plus className="absolute left-1/2 top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 text-text-muted" />
                    ) : (
                      <BedDouble className="absolute left-1/2 top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 text-text-muted" />
                    )}
                  </span>
                  <span className="flex flex-col gap-0.5 p-2">
                    <span className="text-xs font-bold text-navy-900">{option.title}</span>
                    <span className="text-[11px] text-text-secondary">{option.caption}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {choice === NEW ? (
          <div className="flex flex-col gap-3 rounded-card border border-line bg-surface-sunken p-3">
            <Field
              label={t("stays.addRoom.lookNameLabel")}
              required
              description={t("stays.addRoom.lookNameDescription")}
            >
              <Input
                value={lookName}
                maxLength={60}
                placeholder={t("stays.addRoom.lookNamePlaceholder")}
                onChange={(event) => setLookName(event.target.value)}
              />
            </Field>
            <RoomPhotosDraft urls={photos} onChange={setPhotos} />
          </div>
        ) : null}

        <div className="rounded-card bg-navy-50 p-3" data-testid="add-room-outcome">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-navy-700">{t("stays.addRoom.outcomeHeading")}</p>
          <p className="mt-1 text-sm font-semibold text-navy-900">{addRoomOutcome(choice, looks, unit.name, t)}</p>
        </div>

        {error ? (
          <p role="alert" className="text-sm text-danger-text">
            {error}
          </p>
        ) : null}
      </form>
    </Sheet>
  );
}
