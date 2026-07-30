from django.contrib import admin

from apps.catalog.models import (
    Category,
    Service,
    ServiceMedia,
    ServicePolicy,
    ServiceQuestion,
    ServiceQuestionOption,
    ServiceVariant,
    Subcategory,
)

admin.site.register(Category)
admin.site.register(Subcategory)
admin.site.register(Service)
admin.site.register(ServiceVariant)
admin.site.register(ServiceQuestion)
admin.site.register(ServiceQuestionOption)
admin.site.register(ServicePolicy)
admin.site.register(ServiceMedia)
