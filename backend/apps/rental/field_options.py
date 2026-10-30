"""Starter choices for rental item details, so owners pick instead of type.

They go into each category's ``asset_schema`` as JSON-schema ``examples``: the form shows them
as a dropdown with an "Other" option for anything else. ``examples`` never restricts what is
accepted, so a custom value is always allowed.
"""

import re

SUGGESTIONS: dict[str, list[str]] = {
    "color": [
        "Black",
        "White",
        "Grey",
        "Silver",
        "Brown",
        "Beige",
        "Red",
        "Blue",
        "Green",
        "Yellow",
        "Wooden finish",
        "Multicolour",
    ],
    "material": [
        "Wood",
        "Engineered wood",
        "Metal",
        "Steel",
        "Aluminium",
        "Plastic",
        "Glass",
        "Fabric",
        "Leather",
        "Rexine",
        "Cane / Rattan",
    ],
    "fuel_type": ["Petrol", "Diesel", "Electric", "CNG", "Hybrid"],
    "vehicle_type": ["Bike", "Scooter", "Car", "SUV", "Van", "Mini truck"],
    "condition": ["New", "Like new", "Good", "Fair"],
}


#: Words that mean the same field. A category author may write ``colour``, ``Color`` or
#: ``frame_colour``; each still gets the colour list.
_ALIASES: dict[str, str] = {"colour": "color"}


def _normalise(text: str) -> str:
    words = [w for w in re.split(r"[^a-z0-9]+", text.lower()) if w]
    return " ".join(_ALIASES.get(w, w) for w in words)


def suggestion_key(key: str, spec: dict) -> str | None:  # type: ignore[type-arg]
    """Which ``SUGGESTIONS`` list fits this field, by its key or its title. None if no list fits.

    An exact match wins (``fuel_type``). Otherwise the field matches colour or material when one
    of its words is that word: ``frame_colour`` and "Colour" are colour, ``material_type`` is
    material, and ``colour_temperature`` is still colour. Only colour and material are matched by
    word; the other lists are specific enough to need their exact key.
    """
    candidates = [_normalise(key)]
    title = spec.get("title")
    if isinstance(title, str) and title.strip():
        candidates.append(_normalise(title))
    for text in candidates:
        exact = text.replace(" ", "_")
        if exact in SUGGESTIONS:
            return exact
    for text in candidates:
        words = set(text.split())
        for word in ("color", "material"):
            if word in words:
                return word
    return None


def with_suggestions(schema: dict) -> dict:  # type: ignore[type-arg]
    """``schema`` with ``examples`` added to every string field we have suggestions for.

    Only fields the category already has are touched; nothing is added to a category that has no
    colour or material field. An author's own ``enum`` or ``examples`` are kept as they are.
    Applied when the schema is served, so a category created or edited after migration ``0014``
    still gets its dropdowns.
    """
    properties = schema.get("properties")
    if not isinstance(properties, dict):
        return schema
    changed = dict(schema)
    out = {}
    for key, spec in properties.items():
        if (
            isinstance(spec, dict)
            and "examples" not in spec
            and "enum" not in spec
            and spec.get("type", "string") == "string"
        ):
            match = suggestion_key(str(key), spec)
            if match is not None:
                out[key] = {**spec, "examples": SUGGESTIONS[match]}
                continue
        out[key] = spec
    changed["properties"] = out
    return changed
