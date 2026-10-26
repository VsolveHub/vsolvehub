"""URL routing for Safety Stories APIs."""

from django.urls import path

from . import views

urlpatterns = [
    path("safety-stories/", views.PublicSafetyStoryListView.as_view(), name="public-safety-stories"),
    path("ops/stories/", views.OpsSafetyStoryListCreateView.as_view(), name="ops-safety-stories-list-create"),
    path("ops/stories/<uuid:story_id>/", views.OpsSafetyStoryDetailView.as_view(), name="ops-safety-stories-detail"),
]
