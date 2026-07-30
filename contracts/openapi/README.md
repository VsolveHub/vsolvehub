# Vsolve Hub API Contract

`v1.yaml` is generated from the Django API and is the only supported backend/frontend
interface.

Rules:

- Django serializers and schema annotations are the source.
- Never hand-edit `v1.yaml`.
- Regenerate after every API change.
- Breaking changes require a versioned migration note.
- Frontend request/response types are generated from this file.

From `backend`:

```powershell
.\.venv\Scripts\python.exe manage.py spectacular --file ..\contracts\openapi\v1.yaml --validate
```
