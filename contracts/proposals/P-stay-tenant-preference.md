# Proposal: Tenant Preference on Stay Properties (A9 Stay)

**Status:** Proposed  
**Author:** Antigravity  
**Reviewed by:** Codex (pending)

---

## Problem

Apartment, PG, and hostel hosts in India screen tenants by gender and household type
(bachelor male, bachelor female, family). This preference is a primary filter for
customers browsing stays, and hosts currently have no structured way to express or enforce it.

---

## Proposed Backend Changes

### 1. Model change — `Property.tenant_preference`

```python
class TenantPreference(models.TextChoices):
    ANY                  = "ANY",                  "Anyone"
    BACHELOR_MALE        = "BACHELOR_MALE",        "Bachelor (male)"
    BACHELOR_FEMALE      = "BACHELOR_FEMALE",      "Bachelor (female)"
    FAMILY               = "FAMILY",               "Family"
    WORKING_PROFESSIONAL = "WORKING_PROFESSIONAL", "Working professional"

# Add to Property model:
tenant_preference = models.CharField(
    max_length=24,
    choices=TenantPreference.choices,
    default=TenantPreference.ANY,
)
```

**Migration required** — default `ANY` means zero data changes.

### 2. Serializer — `PropertySerializer`

Expose as a writable field:
```python
tenant_preference = serializers.ChoiceField(
    choices=Property.TenantPreference.choices,
    default=Property.TenantPreference.ANY,
)
```

Include `tenant_preference` in both list (summary) and detail serializers so the card
and filter both work without a second fetch.

### 3. Public list endpoint — new query param

```
GET /api/v1/stays?tenant_preference=BACHELOR_FEMALE
```

Filter applied when `tenant_preference` is in `TenantPreference.values`. `ANY` properties
must appear in **all** filtered results (a property open to anyone matches a female-bachelor filter).

```python
if tenant_preference and tenant_preference != "ANY":
    qs = qs.filter(
        models.Q(tenant_preference=tenant_preference) |
        models.Q(tenant_preference="ANY")
    )
```

---

## Example Response (list item)

```json
{
  "id": "uuid",
  "title": "Sunrise PG for Ladies",
  "tenant_preference": "BACHELOR_FEMALE",
  ...
}
```

---

## User-Visible Errors

| Code | Message |
|------|---------|
| `invalid_preference` | Choose a valid occupant preference (Anyone, Bachelor, Family, or Working professional). |

---

## Frontend Notes (Antigravity)

Once published in v1.yaml, Antigravity will:
1. Add the `tenant_preference` select to `property-create-form.tsx` and `stay-record-sheets.tsx`.
2. Add filter chips (Any / Bachelor M / Ladies / Family / Professional) to `stay-filters.tsx`.
3. Show the preference badge on `StayCard`.
4. Pass `tenant_preference` to `fetchStays` in the browse page.
