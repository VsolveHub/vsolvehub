# Proposal: Adults + Children Guest Breakdown on Stay Enquiries (A9 Stay)

**Status:** Proposed  
**Author:** Antigravity  
**Reviewed by:** Codex (pending)

---

## Problem

`StayEnquiry.guest_count` is a single integer. Hosts need to know the composition of the
party — specifically whether children are included — to assess suitability and negotiate. 
The current field collapses this information.

---

## Proposed Backend Changes

### 1. Model changes — `StayEnquiry` and `StayReservation`

```python
# Add to StayEnquiry:
adult_count = models.PositiveSmallIntegerField(default=1)
child_count  = models.PositiveSmallIntegerField(default=0)

# Add to StayReservation:
adult_count = models.PositiveSmallIntegerField(default=1)
child_count  = models.PositiveSmallIntegerField(default=0)
```

`guest_count` is kept as a stored field for backwards compatibility. On save, populate it:

```python
def save(self, *args, **kwargs):
    self.guest_count = self.adult_count + self.child_count
    super().save(*args, **kwargs)
```

**Migration required** — existing rows default to `adult_count=1, child_count=0`.

### 2. Serializer validation — `CreateEnquiryRequest`

```python
adult_count = serializers.IntegerField(min_value=1, default=1)
child_count  = serializers.IntegerField(min_value=0, default=0)

def validate(self, data):
    total = data.get("adult_count", 1) + data.get("child_count", 0)
    unit = data.get("unit")  # resolved from unit_id
    if unit and total > unit.max_guests:
        raise ValidationError(
            {"guest_count": f"This room fits at most {unit.max_guests} guests."}
        )
    data["guest_count"] = total
    return data
```

### 3. Serializer — `StayEnquiry` response

Add `adult_count` and `child_count` to both the guest-facing and host-facing detail serializers.
The host workspace currently shows `guest_count`; update the label display to show
"2 adults + 1 child" when `child_count > 0`.

### 4. No new endpoints required

The existing `POST /api/v1/stays/enquire` body just gains two optional new fields:
```json
{
  "property_id": "...",
  "unit_id": "...",
  "check_in": "2026-11-01",
  "length": 3,
  "adult_count": 2,
  "child_count": 1,
  "message": ""
}
```

---

## Example Payload & Response

**Request**
```json
POST /api/v1/stays/enquire
{
  "property_id": "prop-uuid",
  "unit_id": "unit-uuid",
  "check_in": "2026-11-01",
  "length": 1,
  "adult_count": 2,
  "child_count": 1
}
```

**Response (201)**
```json
{
  "id": "enq-uuid",
  "guest_count": 3,
  "adult_count": 2,
  "child_count": 1,
  ...
}
```

---

## User-Visible Errors

| Code | Message |
|------|---------|
| `guest_count_exceeded` | This room fits at most {max} guests. Reduce the number of guests. |
| `adult_required` | At least one adult must be in the booking. |

---

## Frontend Notes (Antigravity)

Frontend changes are already committed in the `stay-quote-panel.tsx`:
- `adultCount` and `childCount` state replaces single `guestCount`.
- `adult_count` and `child_count` are sent in the mutation body; `guest_count` = sum.
- The backend currently ignores unknown fields gracefully; once this migration lands
  the breakdown will be stored and shown in the partner's enquiry workspace.
- `stay-enquiries-workspace.tsx` and `stay-record-sheets.tsx` will display
  "2 adults + 1 child" where `child_count > 0`, falling back to "{n} guests".
