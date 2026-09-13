"""Custom request parsers for permissive media type handling."""

from rest_framework.parsers import JSONParser


class PlainTextJSONParser(JSONParser):
    """
    Fallback JSON parser for requests with Content-Type: text/plain
    (e.g., when browser fetch sends stringified JSON without an explicit Content-Type header).
    """

    media_type = "text/plain"
