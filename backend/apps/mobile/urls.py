from django.urls import path

from apps.mobile.views import (
    AppConfigView,
    MobileOtpVerifyView,
    PushDeviceRegisterView,
    PushDeviceUnregisterView,
)

app_name = "mobile"

urlpatterns = [
    path("auth/mobile/otp/verify/", MobileOtpVerifyView.as_view(), name="mobile-otp-verify"),
    path("mobile/devices/", PushDeviceRegisterView.as_view(), name="mobile-device-register"),
    path(
        "mobile/devices/unregister/",
        PushDeviceUnregisterView.as_view(),
        name="mobile-device-unregister",
    ),
    path("mobile/app-config/", AppConfigView.as_view(), name="mobile-app-config"),
]
