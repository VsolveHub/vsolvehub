"""Opaque references: what the model sees instead of database ids.

A tool result names a variant `V3` and a slot `T12`; only this module knows which rows those are.
Three things follow. The model cannot address a row it was never shown, a prompt cannot talk it
into guessing one, and nothing it writes to the Customer can carry an internal id.
"""

from typing import cast

from .llm import JsonObject

PREFIX = {
    "service": "S",
    "variant": "V",
    "address": "A",
    "item": "I",
    "slot": "T",
    "quote": "Q",
}

#: Older references are forgotten first. A conversation long enough to reach this has long since
#: re-run the searches it would need.
MAX_REFS = 300


class UnknownReferenceError(ValueError):
    def __init__(self, ref: object, kind: str) -> None:
        super().__init__(f"{ref!r} is not a {kind} reference from this conversation.")
        self.ref = ref
        self.kind = kind


def _refs(state: JsonObject) -> dict[str, JsonObject]:
    refs = state.setdefault("refs", {})
    return cast(dict[str, JsonObject], refs)


def remember(state: JsonObject, kind: str, payload: JsonObject) -> str:
    """The reference for `payload`, reusing the one already issued for the same row."""

    refs = _refs(state)
    for ref, entry in refs.items():
        if entry.get("kind") == kind and entry.get("payload") == payload:
            return ref
    counters = cast(dict[str, int], state.setdefault("ref_counters", {}))
    counters[kind] = int(counters.get(kind, 0)) + 1
    ref = f"{PREFIX[kind]}{counters[kind]}"
    refs[ref] = {"kind": kind, "payload": payload}
    while len(refs) > MAX_REFS:
        refs.pop(next(iter(refs)))
    return ref


def recall(state: JsonObject, ref: object, kind: str) -> JsonObject:
    entry = _refs(state).get(str(ref).strip().upper())
    if not isinstance(entry, dict) or entry.get("kind") != kind:
        raise UnknownReferenceError(ref, kind)
    return cast(JsonObject, entry["payload"])
