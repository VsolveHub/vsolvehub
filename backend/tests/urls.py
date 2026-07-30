from django.urls import path
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView


class ValidationErrorView(APIView):
    authentication_classes = ()
    permission_classes = (AllowAny,)

    def get(self, _request: Request) -> Response:
        raise ValidationError({"phone": ["Enter a valid phone number."]})


class NotFoundErrorView(APIView):
    authentication_classes = ()
    permission_classes = (AllowAny,)

    def get(self, _request: Request) -> Response:
        raise NotFound("Booking was not found.")


class UnexpectedErrorView(APIView):
    authentication_classes = ()
    permission_classes = (AllowAny,)

    def get(self, _request: Request) -> Response:
        raise RuntimeError("sensitive implementation detail")


urlpatterns = [
    path("validation/", ValidationErrorView.as_view()),
    path("not-found/", NotFoundErrorView.as_view()),
    path("unexpected/", UnexpectedErrorView.as_view()),
]
