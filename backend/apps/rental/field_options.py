"""Starter choices for rental item details, so owners pick instead of type.

They go into each category's ``asset_schema`` as JSON-schema ``examples``: the form shows them
as a dropdown with an "Other" option for anything else. ``examples`` never restricts what is
accepted, so a custom value is always allowed.
"""

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


def with_suggestions(schema: dict) -> dict:  # type: ignore[type-arg]
    """``schema`` with ``examples`` added to every property we have suggestions for."""
    properties = schema.get("properties")
    if not isinstance(properties, dict):
        return schema
    changed = dict(schema)
    changed["properties"] = {
        key: (
            {**spec, "examples": SUGGESTIONS[key]}
            if isinstance(spec, dict) and key in SUGGESTIONS and "examples" not in spec
            else spec
        )
        for key, spec in properties.items()
    }
    return changed
