from django.contrib import admin

from apps.pricing.models import PricingPolicy, ServiceRate, TaskRate

admin.site.register(ServiceRate)
admin.site.register(TaskRate)
admin.site.register(PricingPolicy)
