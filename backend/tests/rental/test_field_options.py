"""Colour and material dropdowns: only on items that already have those fields."""

import pytest

from apps.catalog.models import A7VariantConfiguration
from apps.rental.field_options import SUGGESTIONS, suggestion_key, with_suggestions
from apps.rental.services import create_asset, get_rental_taxonomy


@pytest.mark.parametrize(
    ("key", "title", "expected"),
    [
        ("color", None, "color"),
        ("colour", None, "color"),
        ("Color", None, "color"),
        ("frame_colour", None, "color"),
        ("shade", "Colour", "color"),
        ("material", None, "material"),
        ("Material type", None, "material"),
        ("fuel_type", None, "fuel_type"),
        ("brand", None, None),
        ("size", "Size", None),
    ],
)
def test_suggestion_key(key, title, expected):
    spec = {"type": "string"}
    if title:
        spec["title"] = title
    assert suggestion_key(key, spec) == expected


def test_only_existing_fields_get_a_list():
    schema = {"type": "object", "properties": {"size": {"type": "string"}}}
    assert with_suggestions(schema) == schema


def test_colour_and_material_get_their_lists():
    schema = {
        "type": "object",
        "properties": {
            "colour": {"type": "string"},
            "material": {"type": "string"},
            "seats": {"type": "integer"},
        },
    }
    out = with_suggestions(schema)
    assert out["properties"]["colour"]["examples"] == SUGGESTIONS["color"]
    assert out["properties"]["material"]["examples"] == SUGGESTIONS["material"]
    assert "examples" not in out["properties"]["seats"]


def test_an_authors_own_list_is_kept():
    schema = {
        "properties": {
            "color": {"type": "string", "enum": ["Red", "Gold"]},
            "material": {"type": "string", "examples": ["Teak"]},
        }
    }
    out = with_suggestions(schema)
    assert out["properties"]["color"] == {"type": "string", "enum": ["Red", "Gold"]}
    assert out["properties"]["material"]["examples"] == ["Teak"]


def test_taxonomy_adds_lists_at_serve_time(rental_world):
    """A category saved after migration 0014 (no ``examples`` stored) still gets the dropdown."""
    config = A7VariantConfiguration.objects.get(variant=rental_world["variant"])
    config.asset_schema = {"type": "object", "properties": {"Colour": {"type": "string"}}}
    config.save(update_fields=("asset_schema",))
    category = rental_world["variant"].service.subcategory.category
    category.slug = "rental-services"
    category.save(update_fields=("slug",))

    variants = [
        v for sub in get_rental_taxonomy() for svc in sub["services"] for v in svc["variants"]
    ]
    served = next(v for v in variants if v["id"] == rental_world["variant"].id)
    assert served["asset_schema"]["properties"]["Colour"]["examples"] == SUGGESTIONS["color"]
    # Nothing was written back: the stored schema is unchanged.
    config.refresh_from_db()
    assert "examples" not in config.asset_schema["properties"]["Colour"]


def test_a_custom_other_value_is_accepted(rental_world):
    config = A7VariantConfiguration.objects.get(variant=rental_world["variant"])
    config.asset_schema = with_suggestions(
        {"type": "object", "properties": {"color": {"type": "string"}}}
    )
    config.save(update_fields=("asset_schema",))
    asset = create_asset(
        partner=rental_world["partner"],
        variant_id=rental_world["variant"].id,
        title="Sofa",
        daily_rate_paise=40_000,
        structured_fields={"color": "Peacock blue"},
    )
    assert asset.structured_fields == {"color": "Peacock blue"}
