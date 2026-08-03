"""Shared primitive serializers for the public API contract."""

from rest_framework import serializers


class MoneySerializer(serializers.Serializer[dict[str, object]]):
    amount_paise = serializers.IntegerField(read_only=True)
    currency = serializers.CharField(read_only=True)
