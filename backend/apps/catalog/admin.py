from django.contrib import admin

from apps.catalog.models import (
    A1VariantConfiguration,
    Category,
    PromoBanner,
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
admin.site.register(A1VariantConfiguration)


@admin.register(PromoBanner)
class PromoBannerAdmin(admin.ModelAdmin):
    list_display = ("title", "category", "is_active", "starts_at", "ends_at", "display_order")
    list_filter = ("is_active", "category")
    search_fields = ("title", "subtitle")
