"""Local development storage views for private-media uploads and reviews."""

from pathlib import Path
from django.conf import settings
from django.http import FileResponse, HttpResponse, JsonResponse
from rest_framework.parsers import BaseParser
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView


class RawBinaryParser(BaseParser):
    media_type = "*/*"

    def parse(self, stream, media_type=None, parser_context=None):
        return stream.read()


class DevStorageView(APIView):
    """Local development storage endpoint for signed PUT uploads and GET downloads.

    Enabled only in development/local mode when settings.DEBUG is True.
    """

    permission_classes = (AllowAny,)
    parser_classes = (RawBinaryParser,)

    def put(self, request, bucket: str, object_key: str):
        base_dir = (settings.BASE_DIR / "private-media" / bucket).resolve()
        file_path = (base_dir / object_key).resolve()
        if not str(file_path).startswith(str(base_dir)):
            return JsonResponse({"detail": "Invalid object key."}, status=400)

        file_path.parent.mkdir(parents=True, exist_ok=True)
        raw_bytes = request.data if isinstance(request.data, (bytes, bytearray)) else request.body
        file_path.write_bytes(raw_bytes)

        content_type = request.content_type or request.META.get("CONTENT_TYPE", "application/octet-stream")
        content_type = content_type.split(";")[0].strip()
        meta_path = file_path.with_suffix(file_path.suffix + ".meta")
        meta_path.write_text(content_type, encoding="utf-8")

        return HttpResponse(status=200)

    def get(self, request, bucket: str, object_key: str):
        base_dir = (settings.BASE_DIR / "private-media" / bucket).resolve()
        file_path = (base_dir / object_key).resolve()
        if not str(file_path).startswith(str(base_dir)) or not file_path.is_file():
            return HttpResponse(status=404)

        meta_path = file_path.with_suffix(file_path.suffix + ".meta")
        content_type = (
            meta_path.read_text(encoding="utf-8").strip()
            if meta_path.is_file()
            else "application/octet-stream"
        )
        return FileResponse(open(file_path, "rb"), content_type=content_type)
