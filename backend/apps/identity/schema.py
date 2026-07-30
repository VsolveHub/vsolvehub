"""OpenAPI representation of the revocable cookie-session authenticator."""

from django.conf import settings
from drf_spectacular.extensions import OpenApiAuthenticationExtension
from drf_spectacular.openapi import AutoSchema


class RevocableSessionScheme(OpenApiAuthenticationExtension):  # type: ignore[no-untyped-call]
    target_class = "apps.identity.authentication.RevocableSessionAuthentication"
    name = "cookieAuth"

    def get_security_definition(self, auto_schema: AutoSchema) -> dict[str, str]:
        del auto_schema
        return {
            "type": "apiKey",
            "in": "cookie",
            "name": settings.SESSION_COOKIE_NAME,
            "description": "Revocable Django session cookie. Mutations also require a CSRF token.",
        }
