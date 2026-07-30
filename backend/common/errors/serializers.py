"""OpenAPI shape for the global API error envelope."""

from rest_framework import serializers


class ApiErrorDetailSerializer(serializers.Serializer[dict[str, object]]):
    code = serializers.CharField(read_only=True)
    message = serializers.CharField(read_only=True)
    details = serializers.JSONField(read_only=True, allow_null=True)
    retryable = serializers.BooleanField(read_only=True)
    request_id = serializers.CharField(read_only=True, allow_null=True)


class ApiErrorSerializer(serializers.Serializer[dict[str, object]]):
    error = ApiErrorDetailSerializer(read_only=True)
