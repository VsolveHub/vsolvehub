"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { friendlyErrorMessage } from "@vsolve/query";
import { Badge, Button, Dialog, Field, Input, formatMoney } from "@vsolve/ui";
import { Plus } from "lucide-react";
import { useState, type FormEvent } from "react";

import {
  addPartnerStayRoom,
  byRoomNumber,
  deletePartnerStayRoom,
  partnerStayRoomAction,
  ratePeriodSuffix,
  updatePartnerStayRoom,
  type StayRoom,
  type StayUnit,
} from "@/features/stays/queries";

const STATUS_LOOK: Record<string, { label: string; dot: string; tone: "success" | "neutral" | "danger" }> = {
  AVAILABLE: { label: "Available", dot: "🟢", tone: "success" },
  UNAVAILABLE: { label: "Not available", dot: "⚪", tone: "neutral" },
  BOOKED: { label: "Booked", dot: "🔴", tone: "danger" },
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
      {on ? "ON" : "OFF"}
    </button>
  );
}

type Pending =
  | { kind: "off"; room: StayRoom }
  | { kind: "book"; room: StayRoom }
  | { kind: "release"; room: StayRoom }
  | null;

/**
 * One room type and its numbered rooms, as the owner manages them.
 *
 * Guests see the type and how many are available. Here every room has its own row: switch it
 * ON or OFF, mark it Booked once a guest has agreed, and mark it available again when they move
 * out. The type's available count follows the rooms.
 */
export function RoomTypeBlock({
  unit,
  pricePeriod,
  summary,
  onEdit,
}: {
  unit: StayUnit;
  pricePeriod: string | undefined;
  /** "Single · up to 1 guest · AC" — the type's description line. */
  summary: string;
  onEdit: () => void;
}) {
  const qc = useQueryClient();
  const rooms = [...(unit.rooms ?? [])].sort(byRoomNumber);
  const available = rooms.filter((room) => room.status === "AVAILABLE").length;
  const booked = rooms.filter((room) => room.status === "BOOKED").length;
  const [pending, setPending] = useState<Pending>(null);
  const [occupant, setOccupant] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [newNumber, setNewNumber] = useState("");
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["partner-stays"] });
  const run = useMutation({
    mutationFn: (job: () => Promise<unknown>) => job(),
    onSuccess: () => {
      setError(null);
      setPending(null);
      setRenaming(null);
      invalidate();
    },
    onError: (err: unknown) => setError(friendlyErrorMessage(err)),
  });

  const switchable = rooms.filter((room) => room.status !== "BOOKED");
  const anyOn = switchable.some((room) => room.status === "AVAILABLE");

  function onAddRoom(event: FormEvent) {
    event.preventDefault();
    const number = newNumber.trim();
    if (!number) return setError("Type the room number, for example 104.");
    run.mutate(async () => {
      await addPartnerStayRoom(unit.id, { number });
      setNewNumber("");
      setAdding(false);
    });
  }

  return (
    <li className="flex flex-col gap-3 rounded-card border border-line bg-surface p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-navy-900">
            {unit.name}{" "}
            <span className="font-normal text-text-secondary">
              · {formatMoney(unit.nightly_rate_paise)} {ratePeriodSuffix(pricePeriod)}
            </span>
          </p>
          <p className="text-xs text-text-secondary">{summary}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={available > 0 ? "success" : "neutral"}>
            {available} of {rooms.length} available
          </Badge>
          {booked > 0 ? <Badge tone="danger">{booked} booked</Badge> : null}
        </div>
      </div>

      {available === 0 ? (
        <p className="rounded-control bg-surface-sunken px-3 py-2 text-xs text-text-secondary">
          No room of this type is available, so guests don&apos;t see it right now.
        </p>
      ) : null}

      <ul className="grid gap-2 sm:grid-cols-2">
        {rooms.map((room) => {
          const look = STATUS_LOOK[room.status ?? "UNAVAILABLE"] ?? STATUS_LOOK.UNAVAILABLE!;
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
                    if (!value) return setError("Type the room number.");
                    run.mutate(() => updatePartnerStayRoom(room.id, { number: value }));
                  }}
                >
                  <Input
                    aria-label="Room number"
                    value={renaming.value}
                    maxLength={40}
                    autoFocus
                    onChange={(event) => setRenaming({ id: room.id, value: event.target.value })}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" size="sm" disabled={run.isPending}>
                      Save
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setRenaming(null)}>
                      Cancel
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
                        Remove room
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
                      title="Rename this room"
                    >
                      {room.number}
                    </button>
                    {isBooked ? (
                      <Badge tone="danger">🔴 Booked</Badge>
                    ) : (
                      <AvailabilitySwitch
                        on={room.status === "AVAILABLE"}
                        disabled={run.isPending}
                        label={`${room.number} available`}
                        onChange={(next) =>
                          next
                            ? run.mutate(() => updatePartnerStayRoom(room.id, { available: true }))
                            : setPending({ kind: "off", room })
                        }
                      />
                    )}
                  </div>
                  <p className="text-xs text-text-secondary">
                    {look.dot} {look.label}
                    {isBooked && room.occupant_name ? ` · ${room.occupant_name}` : ""}
                  </p>
                  {isBooked ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setPending({ kind: "release", room })}
                    >
                      Mark available
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
                      Mark Booked
                    </Button>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>

      {adding ? (
        <form className="flex flex-wrap items-end gap-2" onSubmit={onAddRoom}>
          <Field label="New room number" className="min-w-[10rem] flex-1">
            <Input
              value={newNumber}
              maxLength={40}
              autoFocus
              placeholder="e.g. 104"
              onChange={(event) => setNewNumber(event.target.value)}
            />
          </Field>
          <Button type="submit" size="sm" disabled={run.isPending}>
            Add
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>
            Cancel
          </Button>
        </form>
      ) : null}

      {error ? <p className="text-sm text-danger-text">{error}</p> : null}

      <div className="flex flex-wrap gap-2 border-t border-line pt-3">
        <Button size="sm" variant="outline" onClick={onEdit}>
          Edit type
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
          <Plus className="size-4" aria-hidden />
          Add room number
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
            {anyOn ? "Turn all off" : "Turn all on"}
          </Button>
        ) : null}
      </div>

      <Dialog
        open={pending?.kind === "off"}
        onOpenChange={(open) => !open && setPending(null)}
        title={pending ? `Turn off ${pending.room.number}?` : ""}
        description="This room will no longer appear as available to customers."
        footer={
          <>
            <Button variant="ghost" onClick={() => setPending(null)}>
              Keep it on
            </Button>
            <Button
              loading={run.isPending}
              onClick={() =>
                pending && run.mutate(() => updatePartnerStayRoom(pending.room.id, { available: false }))
              }
            >
              Turn off
            </Button>
          </>
        }
      >
        {null}
      </Dialog>

      <Dialog
        open={pending?.kind === "book"}
        onOpenChange={(open) => !open && setPending(null)}
        title="Booking confirmed?"
        description={
          pending
            ? `${pending.room.number} will show as Booked and stop appearing as available.`
            : undefined
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setPending(null)}>
              Not yet
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
              Yes – Mark Room Booked
            </Button>
          </>
        }
      >
        <Field label="Guest's name" showOptional>
          <Input
            value={occupant}
            maxLength={120}
            placeholder="For your own reference"
            onChange={(event) => setOccupant(event.target.value)}
          />
        </Field>
      </Dialog>

      <Dialog
        open={pending?.kind === "release"}
        onOpenChange={(open) => !open && setPending(null)}
        title={pending ? `Make ${pending.room.number} available again?` : ""}
        description="Use this when the guest has moved out or the booking fell through. Guests will see the room as available."
        footer={
          <>
            <Button variant="ghost" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button
              loading={run.isPending}
              onClick={() => pending && run.mutate(() => partnerStayRoomAction(pending.room.id, "release"))}
            >
              Mark available
            </Button>
          </>
        }
      >
        {null}
      </Dialog>
    </li>
  );
}
