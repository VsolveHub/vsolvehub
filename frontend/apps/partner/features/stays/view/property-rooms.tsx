"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { friendlyErrorMessage } from "@vsolve/query";
import { Button, Field, Input, Textarea } from "@vsolve/ui";
import { useId, useState, type FormEvent } from "react";

import {
  createPartnerStayUnit,
  updatePartnerStayUnit,
  type StayProperty,
  type StayTaxonomyVariant,
  type StayUnit,
} from "@/features/stays/queries";

import { RoomPhotosDraft } from "./room-photos";
import { RoomTypeBlock } from "./room-type-block";
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
  /** "101, 102, 103" — optional; when given, the count is how many are listed. */
  roomNumbers: string;
  maxGuests: string;
  sharing: string;
  attributes: Record<string, string>;
};

const EMPTY_ROOM: RoomDraft = {
  name: "",
  rate: "",
  quantity: "1",
  roomNumbers: "",
  maxGuests: "1",
  sharing: "1",
  attributes: {},
};

/**
 * How the stay type lets its rooms, which decides the one number the host gives per room.
 * SHARED (PG, hostel): people sharing the room. PRIVATE (hotel, apartment): guests per room.
 * MIXED (a type the server does not classify): both. The server applies the same rule.
 */
type RoomStyle = "SHARED" | "PRIVATE" | "MIXED";

function roomStyleOf(value: string | undefined): RoomStyle {
  return value === "SHARED" || value === "PRIVATE" ? value : "MIXED";
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function draftFrom(unit: StayUnit): RoomDraft {
  return {
    name: unit.name,
    rate: paiseToRupeeInput(unit.nightly_rate_paise),
    quantity: String(unit.quantity ?? 1),
    roomNumbers: "",
    maxGuests: String(unit.max_guests ?? 1),
    sharing: String(unit.sharing_count ?? 1),
    attributes: answersFrom(unit.attributes),
  };
}

type ParsedRoom = {
  name: string;
  nightly_rate_paise: number;
  quantity: number;
  room_numbers: string[];
  max_guests: number;
  sharing_count: number;
  attributes: Record<string, string | number | boolean>;
};

function parseRoom(
  draft: RoomDraft,
  roomSchema: Record<string, unknown> | undefined,
  priceLabel: string,
  style: RoomStyle,
): ParsedRoom | string {
  if (!draft.name.trim()) return "Name the room, for example “Deluxe” or “Double sharing”.";
  const rate = rupeesToPaise(draft.rate);
  if (rate === null) return `Enter the ${priceLabel.toLowerCase()} in rupees.`;
  const roomNumbers = splitRoomNumbers(draft.roomNumbers);
  const lower = roomNumbers.map((n) => n.toLowerCase());
  const repeated = roomNumbers.find((n, i) => lower.indexOf(n.toLowerCase()) !== i);
  if (repeated) return `${repeated} is listed twice.`;
  const quantity = roomNumbers.length > 0 ? roomNumbers.length : wholeNumber(draft.quantity);
  if (quantity === null) return "Number of rooms must be 1 or more.";
  const maxGuests = style === "SHARED" ? 1 : wholeNumber(draft.maxGuests);
  if (maxGuests === null) return "Guests per room must be 1 or more.";
  const sharing = style === "PRIVATE" ? 1 : wholeNumber(draft.sharing);
  if (sharing === null) return "People sharing must be 1 or more.";
  const collected = collectSchemaAnswers(roomSchema, draft.attributes);
  if ("missing" in collected) return `Choose ${collected.missing}.`;
  return {
    name: draft.name.trim(),
    nightly_rate_paise: rate,
    quantity,
    room_numbers: roomNumbers,
    // A shared room fits as many people as share it; a private room is never "shared".
    max_guests: style === "SHARED" ? sharing : maxGuests,
    sharing_count: sharing,
    attributes: collected.values,
  };
}

/** "101, 102 103" or one per line → ["101", "102", "103"]. */
function splitRoomNumbers(input: string): string[] {
  return input
    .split(/[,\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function roomSummary(unit: StayUnit, style: RoomStyle): string {
  const sharing = unit.sharing_count ?? 1;
  const parts: string[] = [];
  if (style === "SHARED") {
    parts.push(sharing === 1 ? "single" : `${sharing} sharing`);
  } else {
    parts.push(`up to ${plural(unit.max_guests ?? 1, "guest")}`);
    if (style === "MIXED" && sharing > 1) parts.push(`${sharing} sharing`);
  }
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
  priceLabel,
  style,
  mode,
}: {
  mode: "new" | "edit";
  idPrefix: string;
  draft: RoomDraft;
  onChange: (next: RoomDraft) => void;
  roomSchema: Record<string, unknown> | undefined;
  suggestions: readonly string[];
  priceLabel: string;
  style: RoomStyle;
}) {
  // No datalist needed — replaced by styled select + custom reveal below.
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Room name" required>
          {(() => {
            // If the current name is not in the suggestions list it was typed custom.
            const isCustom = draft.name !== "" && !suggestions.includes(draft.name);
            const selectValue = isCustom ? "__custom__" : draft.name;
            return (
              <div className="flex flex-col gap-2">
                <select
                  id={`${idPrefix}-name`}
                  value={selectValue}
                  onChange={(e) => {
                    if (e.target.value === "__custom__") {
                      onChange({ ...draft, name: "" });
                    } else {
                      onChange({ ...draft, name: e.target.value });
                    }
                  }}
                  className="w-full rounded-control border border-line bg-surface-sunken px-3.5 py-2.5 text-sm text-text focus:border-line-strong focus:outline-none"
                >
                  <option value="">— pick a room type —</option>
                  {suggestions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                  <option value="__custom__">Other (type below) ↓</option>
                </select>
                {(selectValue === "__custom__" || isCustom) && (
                  <Input
                    id={`${idPrefix}-name-custom`}
                    value={draft.name}
                    maxLength={120}
                    placeholder="e.g. Loft Suite, Balcony Room"
                    autoFocus
                    onChange={(e) => onChange({ ...draft, name: e.target.value })}
                  />
                )}
              </div>
            );
          })()}
        </Field>
        <Field label={priceLabel} required>
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
      {mode === "new" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Room numbers"
            showOptional
            description="One per room, separated by commas — e.g. 101, 102, 103. You can rename them later."
          >
            <Textarea
              id={`${idPrefix}-numbers`}
              rows={2}
              value={draft.roomNumbers}
              placeholder="101, 102, 103"
              onChange={(e) => onChange({ ...draft, roomNumbers: e.target.value })}
            />
          </Field>
          {splitRoomNumbers(draft.roomNumbers).length === 0 ? (
            <Field
              label="How many of these rooms"
              required
              description="Identical rooms you rent at this price. They're numbered Room 1, Room 2… until you rename them."
            >
              <Input
                id={`${idPrefix}-quantity`}
                inputMode="numeric"
                value={draft.quantity}
                onChange={(e) => onChange({ ...draft, quantity: e.target.value })}
              />
            </Field>
          ) : (
            <p className="self-center text-sm text-text-secondary">
              {plural(splitRoomNumbers(draft.roomNumbers).length, "room")} of this type.
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs text-text-secondary">
          Add, rename or remove individual rooms in the list below.
        </p>
      )}
      <div className={`grid gap-3 ${style === "MIXED" ? "sm:grid-cols-2" : "sm:grid-cols-1"}`}>
        {style !== "SHARED" ? (
          <Field
            label="Guests per room"
            required
            description="Most people one booking of this room can bring."
          >
            <Input
              id={`${idPrefix}-guests`}
              inputMode="numeric"
              value={draft.maxGuests}
              onChange={(e) => onChange({ ...draft, maxGuests: e.target.value })}
            />
          </Field>
        ) : null}
        {style !== "PRIVATE" ? (
          <Field
            label="People sharing this room"
            required
            description="1 for a single room, 2 for double sharing, and so on."
          >
            <Input
              id={`${idPrefix}-sharing`}
              inputMode="numeric"
              value={draft.sharing}
              onChange={(e) => onChange({ ...draft, sharing: e.target.value })}
            />
          </Field>
        ) : null}
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
 * Room types under one property, and the numbered rooms under each type.
 *
 * Guests book a *type* ("Single room"). The owner manages each physical room under it by its
 * own number, switching it on or off and marking it Booked. A type with nothing available
 * stops appearing to guests on its own.
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
  const [newPhotos, setNewPhotos] = useState<string[]>([]);
  const [newError, setNewError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<RoomDraft>(EMPTY_ROOM);
  const [editError, setEditError] = useState<string | null>(null);

  const roomSchema = variant?.room_schema;
  const style = roomStyleOf(property.room_style);
  const priceLabel = property.price_period === "NIGHT" ? "Price per night" : "Rent per month";
  const hasRoomQuestions = Object.keys(schemaPropertyMap(roomSchema)).length > 0;
  const suggestions = variant?.room_name_suggestions?.length
    ? variant.room_name_suggestions
    : FALLBACK_ROOM_NAMES;
  const units: StayUnit[] = property.units ?? [];
  const invalidate = () => void qc.invalidateQueries({ queryKey: ["partner-stays"] });

  const create = useMutation({
    mutationFn: (room: ParsedRoom) =>
      createPartnerStayUnit(property.id, { ...room, image_urls: newPhotos }),
    onSuccess: () => {
      setNewRoom(EMPTY_ROOM);
      setNewPhotos([]);
      setAdding(false);
      invalidate();
    },
    onError: (err: unknown) => setNewError(friendlyErrorMessage(err)),
  });
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof updatePartnerStayUnit>[1] }) =>
      updatePartnerStayUnit(id, patch),
    onSuccess: () => {
      setEditingId(null);
      invalidate();
    },
    onError: (err: unknown) => setEditError(friendlyErrorMessage(err)),
  });

  function onAdd(event: FormEvent) {
    event.preventDefault();
    const parsed = parseRoom(newRoom, roomSchema, priceLabel, style);
    if (typeof parsed === "string") return setNewError(parsed);
    setNewError(null);
    create.mutate(parsed);
  }

  function onSave(event: FormEvent, unit: StayUnit) {
    event.preventDefault();
    const parsed = parseRoom(editDraft, roomSchema, priceLabel, style);
    if (typeof parsed === "string") return setEditError(parsed);
    setEditError(null);
    // The count is managed room by room below, so an edit never sends it.
    update.mutate({
      id: unit.id,
      patch: {
        name: parsed.name,
        nightly_rate_paise: parsed.nightly_rate_paise,
        max_guests: parsed.max_guests,
        sharing_count: parsed.sharing_count,
        attributes: parsed.attributes,
      },
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-card border border-line bg-surface-sunken p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-bold text-navy-900">Rooms and availability</h3>
          <p className="text-xs text-text-secondary">
            🟢 Available · ⚪ Not available (switched off) · 🔴 Booked
          </p>
        </div>
        {!adding ? (
          <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
            Add a room type
          </Button>
        ) : null}
      </div>
      {units.length === 0 && !adding ? (
        <p className="text-sm text-text-secondary">No rooms yet. Add one to publish.</p>
      ) : null}

      <ul className="flex flex-col gap-3">
        {units.map((unit) =>
          editingId === unit.id ? (
            <li key={unit.id} className="rounded-card border border-line bg-surface p-3">
              <form className="flex flex-col gap-3" onSubmit={(event) => onSave(event, unit)}>
                <RoomFields
                  mode="edit"
                  idPrefix={`${idBase}-edit-${unit.id}`}
                  draft={editDraft}
                  onChange={setEditDraft}
                  roomSchema={roomSchema}
                  suggestions={suggestions}
                  priceLabel={priceLabel}
                  style={style}
                />
                <p className="text-xs text-text-secondary">
                  New prices apply to new bookings. Guests already booked keep their price.
                </p>
                {editError ? <p className="text-sm text-danger-text">{editError}</p> : null}
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" size="sm" disabled={update.isPending}>
                    {update.isPending ? "Saving…" : "Save room type"}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                    Cancel
                  </Button>
                </div>
              </form>
            </li>
          ) : (
            <RoomTypeBlock
              key={unit.id}
              property={property}
              unit={unit}
              pricePeriod={property.price_period}
              summary={roomSummary(unit, style)}
              onEdit={() => {
                setEditingId(unit.id);
                setEditDraft(draftFrom(unit));
                setEditError(null);
              }}
            />
          ),
        )}
      </ul>

      {adding ? (
        <form
          className="flex flex-col gap-3 rounded-card border border-dashed border-line-strong bg-surface p-3"
          onSubmit={onAdd}
        >
          <RoomFields
            mode="new"
            idPrefix={`${idBase}-new`}
            draft={newRoom}
            onChange={setNewRoom}
            roomSchema={roomSchema}
            suggestions={suggestions}
            priceLabel={priceLabel}
            style={style}
          />
          <RoomPhotosDraft urls={newPhotos} onChange={setNewPhotos} />
          {!hasRoomQuestions ? null : (
            <p className="text-xs text-text-secondary">
              Room details like AC are asked per room type, so one property can have both kinds.
            </p>
          )}
          {newError ? <p className="text-sm text-danger-text">{newError}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={create.isPending}>
              {create.isPending ? "Adding…" : "Add room type"}
            </Button>
            {units.length > 0 ? (
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
