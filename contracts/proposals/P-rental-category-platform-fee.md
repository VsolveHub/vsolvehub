# Proposal: Category-wise Platform Fee for Rentals (A7 Rental)

**Status:** Proposed  
**Author:** Antigravity  
**Reviewed by:** Codex (pending)

---

## Problem

`RentalPlatformFee` is a singleton (id=1). A single percentage applies to every rental
regardless of category. High-value equipment categories (e.g. industrial machinery) may
warrant a different fee than low-value ones (e.g. camping gear). Operations needs
per-category control without having to edit a single global dial.

---

## Proposed Backend Changes

### 1. New model — `RentalCategoryPlatformFee`

```python
class RentalCategoryPlatformFee(models.Model):
    """Per-category override of the global rental platform fee.
    
    When a booking is placed, the service resolves the fee in this priority order:
      1. RentalCategoryPlatformFee for the asset's category (if any)
      2. Global RentalPlatformFee singleton (fallback)
    """
    category   = models.OneToOneField(
        "catalog.ServiceCategory",
        on_delete=models.CASCADE,
        related_name="rental_platform_fee",
    )
    percent    = models.PositiveSmallIntegerField(default=0)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="+",
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=models.Q(percent__lte=100),
                name="rental_cat_fee_percent_range",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.category.name}: {self.percent}%"
```

**Migration required.** No existing rows are affected.

### 2. Service change — `RentalBookingService.create_booking`

```python
def resolve_platform_fee_percent(asset: RentalAsset) -> int:
    """Category fee → global fee → 0."""
    try:
        cat_fee = RentalCategoryPlatformFee.objects.get(
            category=asset.variant.service.category
        )
        return cat_fee.percent
    except RentalCategoryPlatformFee.DoesNotExist:
        pass
    try:
        return RentalPlatformFee.objects.get(id=1).percent
    except RentalPlatformFee.DoesNotExist:
        return 0
```

The resolved percent is snapshotted into `RentalBooking.platform_fee_percent` exactly as today.

### 3. Admin endpoints (Operations)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/ops/rentals/platform-fees` | List all category fees + global fallback |
| `PUT` | `/api/v1/ops/rentals/platform-fees/{category_id}` | Set or update a category fee |
| `DELETE` | `/api/v1/ops/rentals/platform-fees/{category_id}` | Remove override (reverts to global) |
| `PUT` | `/api/v1/ops/rentals/platform-fees/global` | Update the global singleton |

### 4. Public rental detail — expose resolved fee

Add `platform_fee_percent` (integer) to the `RentalAsset` detail serializer so the booking
panel can show the fee line item before the customer books.

```json
GET /api/v1/rentals/{slug}
{
  "id": "...",
  "title": "Bosch Hammer Drill",
  "daily_rate_paise": 25000,
  "platform_fee_percent": 5,
  ...
}
```

---

## Example Payloads

**Set category fee**
```
PUT /api/v1/ops/rentals/platform-fees/42
{ "percent": 8 }

→ 200 { "category_id": 42, "category_name": "Power Tools", "percent": 8, "updated_at": "…" }
```

**List**
```
GET /api/v1/ops/rentals/platform-fees
→ 200 {
  "global_percent": 5,
  "categories": [
    { "category_id": 42, "category_name": "Power Tools", "percent": 8 },
    { "category_id": 17, "category_name": "Camping Gear", "percent": 3 }
  ]
}
```

---

## User-Visible Errors

| Code | Message |
|------|---------|
| `invalid_percent` | Platform fee must be between 0 and 100. |
| `category_not_found` | Category not found. |

---

## Frontend Notes (Antigravity)

Once the contract is published, Antigravity will:
1. Build the "Platform Fees" section in the Operations admin app.
2. Show the `platform_fee_percent` line item in `rental-book-panel.tsx` when non-zero.
