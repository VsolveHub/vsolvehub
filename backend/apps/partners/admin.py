from django.contrib import admin

from apps.partners.models import (
    PartnerApplication,
    PartnerApplicationTransition,
    PartnerAvailabilityException,
    PartnerAvailabilityRule,
    PartnerConsent,
    PartnerDocument,
    PartnerLocation,
    PartnerOnlineSession,
    PartnerProfile,
    PartnerService,
    PartnerServiceArea,
    PartnerSkill,
    Skill,
)

admin.site.register(PartnerProfile)
admin.site.register(PartnerApplication)
admin.site.register(PartnerApplicationTransition)
admin.site.register(Skill)
admin.site.register(PartnerSkill)
admin.site.register(PartnerService)
admin.site.register(PartnerServiceArea)
admin.site.register(PartnerConsent)
admin.site.register(PartnerDocument)
admin.site.register(PartnerAvailabilityRule)
admin.site.register(PartnerAvailabilityException)
admin.site.register(PartnerLocation)
admin.site.register(PartnerOnlineSession)
