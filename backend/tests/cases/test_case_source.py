"""A case names the row that opened it, so the console can act on that row."""

import uuid

from apps.cases.serializers import case_source


def test_m2_key_splits_into_kind_and_id():
    source_id = uuid.uuid4()
    assert case_source(f"m2:engagement_stage:{source_id}") == ("engagement_stage", str(source_id))
    assert case_source(f"m2:safety_incident:{source_id}") == ("safety_incident", str(source_id))


def test_other_keys_have_no_source():
    assert case_source("") is None
    assert case_source("manual-123") is None
    assert case_source("m2:engagement_stage:not-a-uuid") is None
    assert case_source(f"m1:booking:{uuid.uuid4()}") is None
    assert case_source(f"m2::{uuid.uuid4()}") is None
