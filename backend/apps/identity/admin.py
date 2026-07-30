from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from apps.identity.models import CustomerProfile, Device, OtpChallenge, Role, User, UserRole


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    ordering = ("-date_joined",)
    list_display = ("phone_number", "full_name", "is_active", "is_staff", "date_joined")
    search_fields = ("phone_number", "full_name", "email")
    readonly_fields = ("date_joined", "created_at", "updated_at", "last_login")
    fieldsets = (
        (None, {"fields": ("phone_number", "password")}),
        ("Profile", {"fields": ("full_name", "email")}),
        (
            "Permissions",
            {
                "fields": (
                    "is_active",
                    "is_staff",
                    "is_superuser",
                    "groups",
                    "user_permissions",
                ),
            },
        ),
        ("Dates", {"fields": ("last_login", "date_joined", "created_at", "updated_at")}),
    )
    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": ("phone_number", "password1", "password2"),
            },
        ),
    )


admin.site.register(Role)
admin.site.register(UserRole)
admin.site.register(CustomerProfile)
admin.site.register(Device)


@admin.register(OtpChallenge)
class OtpChallengeAdmin(admin.ModelAdmin):
    list_display = (
        "phone_number",
        "purpose",
        "created_at",
        "expires_at",
        "consumed_at",
        "failed_attempts",
    )
    readonly_fields = (
        "phone_number",
        "purpose",
        "code_hash",
        "request_ip_hash",
        "device_hash",
        "created_at",
        "expires_at",
        "consumed_at",
        "failed_attempts",
        "max_attempts",
    )

    def has_add_permission(self, _request: object) -> bool:
        return False
