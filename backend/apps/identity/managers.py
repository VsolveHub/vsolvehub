"""Custom user manager with phone-number identity."""

from typing import TYPE_CHECKING

from django.contrib.auth.base_user import BaseUserManager

from apps.identity.phone import normalize_phone_number


class UserManager(BaseUserManager["User"]):
    use_in_migrations = True

    def create_user(
        self,
        phone_number: str,
        password: str | None = None,
        **extra_fields: object,
    ) -> "User":
        user = self.model(
            phone_number=normalize_phone_number(phone_number),
            **extra_fields,
        )
        user.set_password(password)
        user.full_clean(exclude={"password"})
        user.save(using=self._db)
        return user

    def create_superuser(
        self,
        phone_number: str,
        password: str,
        **extra_fields: object,
    ) -> "User":
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("is_active", True)

        if extra_fields.get("is_staff") is not True:
            raise ValueError("A superuser must have is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("A superuser must have is_superuser=True.")

        return self.create_user(
            phone_number,
            password,
            **extra_fields,
        )


if TYPE_CHECKING:
    from apps.identity.models import User
