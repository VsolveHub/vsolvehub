"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { friendlyErrorMessage } from "@vsolve/query";
import { Badge, Button, Field, Input, formatMoney } from "@vsolve/ui";
import { useId, useState, type FormEvent } from "react";

import {
  createPartnerStayUnit,
  updatePartnerStayUnit,
  type StayProperty,
  type StayTaxonomyVariant,
  type StayUnit,
} from "@/features/stays/queries";

import { SchemaQuestions } from "./schema-questions";
import {
  FALLBACK_ROOM_NAMES,
  answersFrom,
  collectSchemaAnswers,
  paiseToRupeeInput,
  rupeesToPaise,
  schemaPropertyMap,
  wholeNumber,
} from "./stay-form-helpers";

type RoomDraft = {
  name: string;
  rate: string;
  quantity: string;
  maxGuests: string;
  sharing: string;
  attributes: Record<string, string>;
};

const EMPTY_ROOM: RoomDraft = {
  name: "",
  rate: "",
  quantity: "1",
  maxGuests: "1",
  sharing: "1",
  attributes: {},
};

function draftFrom(unit: StayUnit): RoomDraft {
  return {
    name: unit.name,
    rate: paiseToRupeeInput(unit.nightly_rate_paise),
    quantity: String(unit.quantity ?? 1),
    maxGuests: String(unit.max_guests ?? 1),
    sharing: String(unit.sharing_count ?? 1),
    attributes: answersFrom(unit.attributes),
  };
}

type ParsedRoom = {
  name: string;
  nightly_rate_paise: number;
  quantity: number;
  max_guests: number;
  sharing_count: number;
  attributes: Record<string, string | number | boolean>;
};

function parseRoom(
  draft: RoomDraft,
  roomSchema: Record<string, unknown> | undefined,
): ParsedRoom | string {
  if (!draft.name.trim()) return "Name the room, for example “Deluxe” or “Double sharing”.";
  const rate = rupeesToPaise(draft.rate);
  if (rate === null) return "Enter the price per night in rupees.";
  const quantity = wholeNumber(draft.quantity);
  if (quantity === null) return "Number of rooms must be 1 or more.";
  const maxGuests = wholeNumber(draft.maxGuests);
  if (maxGuests === null) return "Guests per booking must be 1 or more.";
  const sharing = wholeNumber(draft.sharing);
  if (sharing === null) return "People sharing must be 1 or more.";
  const collected = collectSchemaAnswers(roomSchema, draft.attributes);
  if ("missing" in collected) return `Choose ${collected.missing}.`;
  return {
    name: draft.name.trim(),
    nightly_rate_paise: rate,
    quantity,
    max_guests: maxGuests,
    sharing_count: sharing,
    attributes: collected.values,
  };
}

function roomSummary(unit: StayUnit): string {
  const parts = [
    `${unit.quantity ?? 1} room${(unit.quantity ?? 1) === 1 ? "" : "s"}`,
    `up to ${unit.max_guests ?? 1} guest${(unit.max_guests ?? 1) === 1 ? "" : "s"}`,
  ];
  if ((unit.sharing_count ?? 1) > 1) parts.push(`${unit.sharing_count} sharing`);
  const attributes = answersFrom(unit.attributes);
  parts.push(...Object.values(attributes).filter(Boolean));
  return parts.join(" · ");
}

function RoomFields({
  idPrefix,
  draft,
  onChange,
  roomSchema,
  suggestions,
}: {
  idPrefix: string;
  draft: RoomDraft;
  onChange: (next: RoomDraft) => void;
  roomSchema: Record<string, unknown> | undefined;
  suggestions: readonly string[];
}) {
  const listId = `${idPrefix}-names`;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Room name" required>
          <Input
            id={`${idPrefix}-name`}
            list={listId}
            value={draft.name}
            maxLength={120}
            placeholder="e.g. Deluxe, Double sharing"
            onChange={(e) => onChange({ ...draft, name: e.target.value })}
          />
          <datalist id={listId}>
            {suggestions.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </Field>
        <Field label="Price per night" required>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm font-semibold text-text-secondary">
              ₹
            </span>
            <Input
              id={`${idPrefix}-rate`}
              className="pl-8"
              inputMode="decimal"
              value={draft.rate}
              onChange={(e) => onChange({ ...draft, rate: e.target.value })}
            />
          </div>
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field
          label="How many of these rooms"
          required
          description="Identical rooms you rent at this price."
        >
          <Input
            id={`${idPrefix}-quantity`}
            inputMode="numeric"
            value={draft.quantity}
            onChange={(e) => onChange({ ...draft, quantity: e.target.value })}
          />
        </Field>
        <Field label="Guests per booking" required>
          <Input
            id={`${idPrefix}-guests`}
            inputMode="numeric"
            value={draft.maxGuests}
            onChange={(e) => onChange({ ...draft, maxGuests: e.target.value })}
          />
        </Field>
        <Field label="People sharing the room" required>
          <Input
            id={`${idPrefix}-sharing`}
            inputMode="numeric"
            value={draft.sharing}
            onChange={(e) => onChange({ ...draft, sharing: e.target.value })}
          />
        </Field>
      </div>
      <SchemaQuestions
        idPrefix={`${idPrefix}-attr`}
        schema={roomSchema}
        answers={draft.attributes}
        onChange={(attributes) => onChange({ ...draft, attributes })}
        columns={3}
      />
    </div>
  );
}

/**
 * Room types under one property: what a guest actually books.
 *
 * One row per *kind* of room — "10 Deluxe rooms" is one entry with a count of 10,
 * not ten identical rows. Deactivating a room that still has guests coming asks
 * first, and says those bookings stay.
 */
export function PropertyRooms({
  property,
  variant,
}: {
  property: StayProperty;
  variant: StayTaxonomyVariant | undefined;
}) {
  const qc = useQueryClient();
  const idBase = useId();
  const [adding, setAdding] = useState((property.units ?? []).length === 0);
  const [newRoom, setNewRoom] = useState<RoomDraft>(EMPTY_ROOM);
  const [newError, setNewError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<RoomDraft>(EMPTY_ROOM);
  const [editError, setEditError] = useState<string | null>(null);
  const [confirmingDeactivate, setConfirmingDeactivate] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);

  const roomSchema = variant?.room_schema;
  const hasRoomQuestions = Object.keys(schemaPropertyMap(roomSchema)).length > 0;
  const suggestions = variant?.room_name_suggestions?.length
    ? variant.room_name_suggestions
    : FALLBACK_ROOM_NAMES;
  const rooms: StayUnit[] = property.units ?? [];

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["partner-stays"] });

  const create = useMutation({
    mutationFn: (room: ParsedRoom) => createPartnerStayUnit(property.id, room),
    onSuccess: () => {
      setNewRoom(EMPTY_ROOM);
      setAdding(false);
      invalidate();
    },
    onError: (err: unknown) => setNewError(friendlyErrorMessage(err)),
  });

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<ParsedRoom> & { is_active?: boolean } }) =>
      updatePartnerStayUnit(id, patch),
    onSuccess: () => {
      setEditingId(null);
      setConfirmingDeactivate(null);
      setRowError(null);
      invalidate();
    },
    onError: (err: unknown, vars) => {
      if (editingId === vars.id) setEditError(friendlyErrorMessage(err));
      else setRowError({ id: vars.id, message: friendlyErrorMessage(err) });
    },
  });

  function onAdd(event: FormEvent) {
    event.preventDefault();
    const parsed = parseRoom(newRoom, roomSchema);
    if (typeof parsed === "string") return setNewError(parsed);
    setNewError(null);
    create.mutate(parsed);
  }

  function onSave(event: FormEvent, unit: StayUnit) {
    event.preventDefault();
    const parsed = parseRoom(editDraft, roomSchema);
    if (typeof parsed === "string") return setEditError(parsed);
    setEditError(null);
    update.mutate({ id: unit.id, patch: parsed });
  }

  return (
    <section className="flex flex-col gap-3 rounded-card border border-line bg-surface-sunken p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold text-navy-900">Rooms and prices</h3>
        {!adding ? (
          <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
            Add a room type
          </Button>
        ) : null}
      </div>

      {rooms.length === 0 && !adding ? (
        <p className="text-sm text-text-secondary">No rooms yet. Add one to publish.</p>
      ) : null}

      <ul className="flex flex-col gap-2">
        {rooms.map((unit) => {
          const upcoming = unit.upcoming_booking_count ?? 0;
          const inactive = unit.is_active === false;
          if (editingId === unit.id) {
            return (
              <li key={unit.id} className="rounded-card border border-line bg-surface p-3">
                <form className="flex flex-col gap-3" onSubmit={(event) => onSave(event, unit)}>
                  <RoomFields
                    idPrefix={`${idBase}-edit-${unit.id}`}
                    draft={editDraft}
                    onChange={setEditDraft}
                    roomSchema={roomSchema}
                    suggestions={suggestions}
                  />
                  <p className="text-xs text-text-secondary">
                    New prices apply to new bookings. Guests already booked keep their price.
                  </p>
                  {editError ? <p className="text-sm text-danger-text">{editError}</p> : null}
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" size="sm" disabled={update.isPending}>
                      {update.isPending ? "Saving…" : "Save room"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              </li>
            );
          }
          return (
            <li
              key={unit.id}
              className={`flex flex-col gap-2 rounded-card border border-line bg-surface p-3 ${
                inactive ? "opacity-70" : ""
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-navy-900">
                    {unit.name}{" "}
                    <span className="font-normal text-text-secondary">
                      · {formatMoney(unit.nightly_rate_paise)} / night
                    </span>
                  </p>
                  <p className="text-xs text-text-secondary">{roomSummary(unit)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {inactive ? <Badge>Not bookable</Badge> : null}
                  {upcoming > 0 ? (
                    <Badge tone="info">
                      {upcoming} upcoming booking{upcoming === 1 ? "" : "s"}
                    </Badge>
                  ) : null}
                </div>
              </div>
              {confirmingDeactivate === unit.id ? (
                <div className="flex flex-col gap-2 rounded-card border border-warning-line bg-warning-surface p-2">
                  <p className="text-sm text-warning-text">
                    {upcoming} booking{upcoming === 1 ? " is" : "s are"} still coming for this
                    room. They stay booked; guests just can’t book it again.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={update.isPending}
                      onClick={() => update.mutate({ id: unit.id, patch: { is_active: false } })}
                    >
                      Stop taking bookings
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmingDeactivate(null)}>
                      Keep it bookable
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditingId(unit.id);
                      setEditDraft(draftFrom(unit));
                      setEditError(null);
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={update.isPending}
                    onClick={() => {
                      if (!inactive && upcoming > 0) {
                        setConfirmingDeactivate(unit.id);
                        return;
                      }
                      update.mutate({ id: unit.id, patch: { is_active: inactive } });
                    }}
                  >
                    {inactive ? "Make bookable again" : "Stop taking bookings"}
                  </Button>
                </div>
              )}
              {rowError?.id === unit.id ? (
                <p className="text-sm text-danger-text">{rowError.message}</p>
              ) : null}
            </li>
          );
        })}
      </ul>

      {adding ? (
        <form
          className="flex flex-col gap-3 rounded-card border border-dashed border-line-strong bg-surface p-3"
          onSubmit={onAdd}
        >
          <RoomFields
            idPrefix={`${idBase}-new`}
            draft={newRoom}
            onChange={setNewRoom}
            roomSchema={roomSchema}
            suggestions={suggestions}
          />
          {!hasRoomQuestions ? null : (
            <p className="text-xs text-text-secondary">
              Room details like AC are asked per room, so one property can have both kinds.
            </p>
          )}
          {newError ? <p className="text-sm text-danger-text">{newError}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={create.isPending}>
              {create.isPending ? "Adding…" : "Add room"}
            </Button>
            {rooms.length > 0 ? (
              <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>
                Cancel
              </Button>
            ) : null}
          </div>
        </form>
      ) : null}
    </section>
  );
}
