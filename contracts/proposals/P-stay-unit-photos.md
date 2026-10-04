# Proposal: Room-wise Unit Photos (A9 Stay)

**Status:** Proposed  
**Author:** Antigravity  
**Reviewed by:** Codex (pending)

---

## Problem

`PropertyMedia` attaches photos to a `Property` only. Guests cannot see photos of a specific
room before enquiring. Hosts who run mixed-inventory properties (e.g. a PG with AC and non-AC
rooms) have no way to visually differentiate their room types.

---

## Proposed Backend Changes

### 1. New model — `UnitMedia`

```python
class UnitMedia(models.Model):
    id            = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    unit          = models.ForeignKey(Unit, on_delete=models.CASCADE, related_name="media")
    url           = models.URLField(max_length=1024)
    caption       = models.CharField(max_length=240, blank=True)
    display_order = models.PositiveSmallIntegerField(default=0)
    created_at    = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("display_order", "created_at")
```

### 2. New model — `StayUnitPhotoUpload` (staging)

```python
class StayUnitPhotoUpload(models.Model):
    """Partner-uploaded unit photo stored before it is attached to a unit."""
    id           = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    partner      = models.ForeignKey("partners.PartnerProfile", on_delete=models.CASCADE,
                                     related_name="stay_unit_photo_uploads")
    stored_file  = models.FileField(upload_to=stay_ad_upload_to)
    original_name = models.CharField(max_length=180)
    content_type = models.CharField(max_length=80)
    size_bytes   = models.PositiveIntegerField()
    created_at   = models.DateTimeField(auto_now_add=True)
    class Meta:
        ordering = ("-created_at",)
```

### 3. Serializer update — `StayUnit`

Add a read-only nested `media` field:
```python
class UnitMediaSerializer(serializers.ModelSerializer):
    class Meta:
        model  = UnitMedia
        fields = ["id", "url", "caption", "display_order"]

class StayUnitSerializer(serializers.ModelSerializer):
    media = UnitMediaSerializer(many=True, read_only=True)
    ...
```

### 4. New endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/stays/units/photos/upload` | Upload a photo to staging. Returns `{ upload_id, url }`. |
| `POST` | `/api/v1/stays/units/{unit_id}/media` | Body: `{ url, caption?, display_order? }`. Attaches to unit. |
| `DELETE` | `/api/v1/stays/units/media/{media_id}` | Removes unit media entry. |

The unit detail serializer (embedded in `PropertySerializer.units`) must include `media`.

---

## Example Payload

**Upload**
```
POST /api/v1/stays/units/photos/upload
Content-Type: multipart/form-data
file: <binary>

→ 201 { "upload_id": "uuid", "url": "https://cdn.example/stay-ads/…/abc.jpg" }
```

**Attach**
```
POST /api/v1/stays/units/{unit_id}/media
{ "url": "https://cdn.example/stay-ads/…/abc.jpg", "caption": "Balcony view", "display_order": 0 }

→ 201 { "id": "uuid", "url": "...", "caption": "Balcony view", "display_order": 0 }
```

---

## User-Visible Errors

| Code | Message |
|------|---------|
| `unit_not_found` | The room you are trying to add a photo to does not exist. |
| `photo_too_large` | Each photo must be 10 MB or smaller. |
| `invalid_file_type` | Only JPEG, PNG and WebP photos are accepted. |
| `media_not_found` | Photo not found or already removed. |
| `permission_denied` | You can only manage photos for your own property's rooms. |
