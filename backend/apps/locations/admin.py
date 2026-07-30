from django.contrib import admin

from apps.locations.models import (
    Address,
    PostalCode,
    ServiceArea,
    ServiceAreaOperatingException,
    ServiceAreaOperatingWindow,
    ServiceAreaPostalCode,
    ServiceAreaService,
)

admin.site.register(PostalCode)
admin.site.register(ServiceArea)
admin.site.register(ServiceAreaPostalCode)
admin.site.register(ServiceAreaService)
admin.site.register(ServiceAreaOperatingWindow)
admin.site.register(ServiceAreaOperatingException)
admin.site.register(Address)
