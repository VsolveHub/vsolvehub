"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { friendlyErrorMessage } from "@vsolve/query";
import { Badge, Button, Dialog, Field, Input, Select, formatMoney, useT } from "@vsolve/ui";
import { Plus } from "lucide-react";
import { useState } from "react";

import {
  byRoomNumber,
  deletePartnerStayLook,
  deletePartnerStayRoom,
  partnerStayRoomAction,
  ratePeriodSuffix,
  renamePartnerStayLook,
  updatePartnerStayRoom,
  type StayLook,
  type StayProperty,
  type StayRoom,
  type StayUnit,
} from "@/features/stays/queries";

import { AddRoomSheet } from "./add-room-sheet";
import { GuestPreview } from "./guest-preview";
import { LookPhotosLive } from "./room-photos";

const STATUS_LOOK: Record<string, { label: string; dot: string; tone: "success" | "neutral" | "danger" }> = {
  // `label` is a catalogue key, resolved with `t` at render time.
  AVAILABLE: { label: "stays.roomBlock.status.available", dot: "🟢", tone: "success" },
  UNAVAILABLE: { label: "stays.enquiryStatus.declined", dot: "⚪", tone: "neutral" },
  BOOKED: { label: "stays.roomBlock.status.booked", dot: "🔴", tone: "danger" },
};

/** The ON / OFF control for one room. Large enough to hit with a thumb. */
function AvailabilitySwitch({
  on,
  disabled,
  label,
  onChange,
}: {
  on: boolean;
  disabled?: boolean;
  label: string;
  onChange: (next: boolean) => void;
}) {
  const t = useT();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`inline-flex h-8 min-w-[4.5rem] items-center gap-2 rounded-full border px-1 pr-3 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${
        on
          ? "border-emerald-300 bg-emerald-50 text-emerald-800"
          : "border-line bg-surface-sunken text-text-secondary"
      }`}
    >
      <span
        aria-hidden
        className={`size-6 rounded-full shadow-sm transition ${
          on ? "translate-x-0 bg-emerald-500" : "bg-white ring-1 ring-line"
        }`}
      />
      {on ? t("stays.roomBlock.on") : t("stays.roomBlock.off")}
    </button>
  );
}

type Pending =
  | { kind: "off"; room: StayRoom }
  | { kind: "book"; room: StayRoom }
  | { kind: "release"; room: StayRoom }
  | null;

/** Rooms of each look, in room-number order. A room whose look isn't listed joins the first. */
export function roomsByLook(unit: StayUnit): Array<{ look: StayLook; rooms: StayRoom[] }> {
  const looks = [...(unit.looks ?? [])].sort((a, b) => a.display_order - b.display_order);
  const rooms = [...(unit.rooms ?? [])].sort(byRoomNumber);
  const known = new Set(looks.map((l) => l.id));
  return looks.map((look, index) => ({
    look,
    rooms: rooms.filter((r) => r.look === look.id || (index === 0 && !known.has(r.look))),
  }));
}

/**
 * One room type and its numbered rooms, as the owner manages them, grouped by look.
 *
 * A look is a set of photos some rooms share ("1 BHK" 101-103 vs 104-105 "With balcony").
 * Guests see one card per look, never room numbers; the panel beside the looks shows those
 * cards live. Every room keeps its ON / OFF switch and Booked controls, and can move to
 * another look.
 */
export function RoomTypeBlock({
  property,
  unit,
  pricePeriod,
  summary,
  onEdit,
}: {
  property: StayProperty;
  unit: StayUnit;
  pricePeriod: string | undefined;
  /** "Single · up to 1 guest · AC" — the type's description line. */
  summary: string;
  onEdit: () => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const rooms = [...(unit.rooms ?? [])].sort(byRoomNumber);
  const available = rooms.filter((room) => room.status === "AVAILABLE").length;
  const booked = rooms.filter((room) => room.status === "BOOKED").length;
  const [pending, setPending] = useState<Pending>(null);
  const [occupant, setOccupant] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const [renamingLook, setRenamingLook] = useState<{ id: string; value: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const groups = roomsByLook(unit);
  const manyLooks = groups.length > 1;

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["partner-stays"] });
  const run = useMutation({
    mutationFn: (job: () => Promise<unknown>) => job(),
    onSuccess: () => {
      setError(null);
      setPending(null);
      setRenaming(null);
      setRenamingLook(null);
      invalidate();
    },
    onError: (err: unknown) => setError(friendlyErrorMessage(err)),
  });

  const switchable = rooms.filter((room) => room.status !== "BOOKED");
  const anyOn = switchable.some((room) => room.status === "AVAILABLE");

  return (
    <li className="flex flex-col gap-3 rounded-card border border-line bg-surface p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-navy-900">
            {unit.name}{" "}
            <span className="font-normal text-text-secondary">
              · {formatMoney(unit.nightly_rate_paise)} {ratePeriodSuffix(pricePeriod, t)}
            </span>
          </p>
          <p className="text-xs text-text-secondary">{summary}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={available > 0 ? "success" : "neutral"}>
            {t("stays.roomBlock.availableOf", { available, total: rooms.length })}
          </Badge>
          {booked > 0 ? <Badge tone="danger">{t("stays.roomBlock.bookedCount", { n: booked })}</Badge> : null}
        </div>
      </div>

      {available === 0 ? (
        <p className="rounded-control bg-surface-sunken px-3 py-2 text-xs text-text-secondary">
          {t("stays.roomBlock.noneAvailable")}
        </p>
      ) : null}

      <div className="flex flex-wrap items-start gap-4">
        <div className="flex min-w-0 flex-[999_1_480px] flex-col gap-3">
          {manyLooks ? (
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">{t("stays.roomBlock.looks")}</p>
          ) : null}
          {groups.map(({ look, rooms: lookRooms }, lookIndex) => (
            <section
              key={look.id}
              className="flex flex-col gap-3 rounded-card border border-line bg-surface-sunken/60 p-3"
              aria-label={look.display_name}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                {renamingLook?.id === look.id ? (
                  <form
                    className="flex flex-1 flex-wrap items-end gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      run.mutate(() => renamePartnerStayLook(look.id, renamingLook.value.trim()));
                    }}
                  >
                    <Field label={t("stays.roomBlock.lookName")} className="min-w-[12rem] flex-1">
                      <Input
                        value={renamingLook.value}
                        maxLength={60}
                        autoFocus
                        placeholder={
                          lookIndex === 0
                            ? t("stays.roomBlock.lookNameFirstPlaceholder")
                            : t("stays.roomBlock.lookNamePlaceholder")
                        }
                        onChange={(event) => setRenamingLook({ id: look.id, value: event.target.value })}
                      />
                    </Field>
                    <Button type="submit" size="sm" disabled={run.isPending}>
                      {t("common.save")}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setRenamingLook(null)}>
                      {t("common.cancel")}
                    </Button>
                  </form>
                ) : (
                  <>
                    <div className="min-w-0">
                      <p className="font-semibold text-navy-900">
                        {manyLooks
                          ? `${t("stays.roomBlock.lookLetter", { letter: String.fromCharCode(65 + lookIndex) })} · `
                          : ""}
                        {look.name ||
                          (manyLooks ? t("stays.roomBlock.mainLook") : t("stays.photos.roomPhotos"))}
                      </p>
                      <p className="text-xs text-text-secondary">
                        {t("stays.roomBlock.guestsSee", {
                          name: look.display_name,
                          count: lookRooms.length,
                        })}
                      </p>
                    </div>
                    {manyLooks ? (
                      <div className="flex flex-wrap gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setRenamingLook({ id: look.id, value: look.name })}
                        >
                          {t("stays.roomBlock.rename")}
                        </Button>
                        {lookRooms.length === 0 ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-danger-text"
                            disabled={run.isPending}
                            onClick={() => run.mutate(() => deletePartnerStayLook(look.id))}
                          >
                            {t("stays.roomBlock.removeLook")}
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </>
                )}
              </div>

              <LookPhotosLive unit={unit} look={look} label={manyLooks ? t("stays.roomBlock.lookPhotos") : undefined} />

      <ul className="grid gap-2 sm:grid-cols-2">
        {lookRooms.map((room) => {
          const status = STATUS_LOOK[room.status ?? "UNAVAILABLE"] ?? STATUS_LOOK.UNAVAILABLE!;
          const isBooked = room.status === "BOOKED";
          const isRenaming = renaming?.id === room.id;
          return (
            <li
              key={room.id}
              className="flex flex-col gap-2 rounded-control border border-line bg-surface-sunken p-3"
            >
              {isRenaming ? (
                <form
                  className="flex flex-col gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const value = renaming.value.trim();
                    if (!value) return setError(t("stays.roomBlock.numberMissing"));
                    run.mutate(() => updatePartnerStayRoom(room.id, { number: value }));
                  }}
                >
                  <Input
                    aria-label={t("stays.addRoom.numberLabel")}
                    value={renaming.value}
                    maxLength={40}
                    autoFocus
                    onChange={(event) => setRenaming({ id: room.id, value: event.target.value })}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" size="sm" disabled={run.isPending}>
                      {t("common.save")}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setRenaming(null)}>
                      {t("common.cancel")}
                    </Button>
                    {!isBooked && rooms.length > 1 ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="ml-auto text-danger-text"
                        disabled={run.isPending}
                        onClick={() => run.mutate(() => deletePartnerStayRoom(room.id))}
                      >
                        {t("stays.roomBlock.removeRoom")}
                      </Button>
                    ) : null}
                  </div>
                </form>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      className="truncate text-left text-base font-bold text-navy-900 hover:underline"
                      onClick={() => setRenaming({ id: room.id, value: room.number })}
                      title={t("stays.roomBlock.renameRoom")}
                    >
                      {room.number}
                    </button>
                    {isBooked ? (
                      <Badge tone="danger">{t("stays.summary.booked")}</Badge>
                    ) : (
                      <AvailabilitySwitch
                        on={room.status === "AVAILABLE"}
                        disabled={run.isPending}
                        label={t("stays.roomBlock.switchLabel", { number: room.number })}
                        onChange={(next) =>
                          next
                            ? run.mutate(() => updatePartnerStayRoom(room.id, { available: true }))
                            : setPending({ kind: "off", room })
                        }
                      />
                    )}
                  </div>
                  <p className="text-xs text-text-secondary">
                    {status.dot} {t(status.label)}
                    {isBooked && room.occupant_name ? ` · ${room.occupant_name}` : ""}
                  </p>
                  {manyLooks ? (
                    <Select
                      aria-label={t("stays.roomBlock.lookOf", { number: room.number })}
                      value={room.look}
                      disabled={run.isPending}
                      onChange={(event) =>
                        run.mutate(() => updatePartnerStayRoom(room.id, { look_id: event.target.value }))
                      }
                    >
                      {groups.map(({ look: option }) => (
                        <option key={option.id} value={option.id}>
                          {option.name || t("stays.roomBlock.mainLook")}
                        </option>
                      ))}
                    </Select>
                  ) : null}
                  {isBooked ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setPending({ kind: "release", room })}
                    >
                      {t("stays.roomBlock.markAvailable")}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setOccupant("");
                        setPending({ kind: "book", room });
                      }}
                    >
                      {t("stays.roomBlock.markBooked")}
                    </Button>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
            </section>
          ))}
        </div>

        <div className="min-w-0 flex-[1_1_300px]">
          <GuestPreview property={property} unit={unit} />
        </div>
      </div>

      {error ? <p className="text-sm text-danger-text">{error}</p> : null}

      <div className="flex flex-wrap gap-2 border-t border-line pt-3">
        <Button size="sm" variant="outline" onClick={onEdit}>
          {t("stays.roomBlock.editType")}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
          <Plus className="size-4" aria-hidden />
          {t("stays.addRoom.submit")}
        </Button>
        {switchable.length > 1 ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={run.isPending}
            onClick={() =>
              run.mutate(() =>
                Promise.all(
                  switchable.map((room) =>
                    updatePartnerStayRoom(room.id, { available: !anyOn }),
                  ),
                ),
              )
            }
          >
            {anyOn ? t("stays.roomBlock.allOff") : t("stays.roomBlock.allOn")}
          </Button>
        ) : null}
      </div>

      <AddRoomSheet unit={unit} open={adding} onOpenChange={setAdding} />

      <Dialog
        open={pending?.kind === "off"}
        onOpenChange={(open) => !open && setPending(null)}
        title={pending ? t("stays.roomBlock.offTitle", { number: pending.room.number }) : ""}
        description={t("stays.roomBlock.offBody")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPending(null)}>
              {t("stays.roomBlock.keepOn")}
            </Button>
            <Button
              loading={run.isPending}
              onClick={() =>
                pending && run.mutate(() => updatePartnerStayRoom(pending.room.id, { available: false }))
              }
            >
              {t("stays.roomBlock.turnOff")}
            </Button>
          </>
        }
      >
        {null}
      </Dialog>

      <Dialog
        open={pending?.kind === "book"}
        onOpenChange={(open) => !open && setPending(null)}
        title={t("stays.enquiry.bookingConfirmed")}
        description={
          pending
            ? t("stays.roomBlock.bookBody", { number: pending.room.number })
            : undefined
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setPending(null)}>
              {t("stays.enquiry.notYet")}
            </Button>
            <Button
              loading={run.isPending}
              onClick={() =>
                pending &&
                run.mutate(() =>
                  partnerStayRoomAction(pending.room.id, "book", { occupant_name: occupant.trim() }),
                )
              }
            >
              {t("stays.enquiry.confirmBooked")}
            </Button>
          </>
        }
      >
        <Field label={t("stays.roomBlock.guestName")} showOptional>
          <Input
            value={occupant}
            maxLength={120}
            placeholder={t("stays.roomBlock.guestNamePlaceholder")}
            onChange={(event) => setOccupant(event.target.value)}
          />
        </Field>
      </Dialog>

      <Dialog
        open={pending?.kind === "release"}
        onOpenChange={(open) => !open && setPending(null)}
        title={pending ? t("stays.roomBlock.releaseTitle", { number: pending.room.number }) : ""}
        description={t("stays.roomBlock.releaseBody")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPending(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              loading={run.isPending}
              onClick={() => pending && run.mutate(() => partnerStayRoomAction(pending.room.id, "release"))}
            >
              {t("stays.roomBlock.markAvailable")}
            </Button>
          </>
        }
      >
        {null}
      </Dialog>
    </li>
  );
}
