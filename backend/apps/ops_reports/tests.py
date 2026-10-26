from typing import cast
from unittest.mock import patch

from rest_framework import status
from rest_framework.request import Request
from rest_framework.test import APITestCase

from apps.identity.models import Role, User, UserRole
from apps.ops_reports.exports import _pdf_total_label_and_amount
from apps.ops_reports.reports import SettlementReport, get_report

from .models import OpsReportSettings


class OpsReportsTests(APITestCase):
    def setUp(self) -> None:
        def mock_has_role(*, request: Request, role_code: str) -> bool:
            return UserRole.objects.filter(
                user=cast(User, request.user), role__code=role_code
            ).exists()

        self.patcher = patch(
            "apps.partners.permissions.has_active_session_role", side_effect=mock_has_role
        )
        self.mock_role = self.patcher.start()

        ops_role, _ = Role.objects.get_or_create(code="operations", defaults={"name": "Operations"})
        customer_role, _ = Role.objects.get_or_create(
            code="customer", defaults={"name": "Customer"}
        )

        self.ops_user = User.objects.create_user(phone_number="+919876543210")
        UserRole.objects.create(user=self.ops_user, role=ops_role)

        self.normal_user = User.objects.create_user(phone_number="+919876543211")
        UserRole.objects.create(user=self.normal_user, role=customer_role)

        OpsReportSettings.objects.create(tds_rate_percent=1.0)

    def tearDown(self) -> None:
        self.patcher.stop()

    def test_catalog_access(self) -> None:
        self.client.force_authenticate(user=self.normal_user)
        response = self.client.get("/api/v1/ops/reports/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(user=self.ops_user)
        response = self.client.get("/api/v1/ops/reports/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(len(response.data) > 0)

    def test_preview_report(self) -> None:
        self.client.force_authenticate(user=self.ops_user)
        response = self.client.get("/api/v1/ops/reports/bookings/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("rows", response.data)

    def test_export_report_csv(self) -> None:
        self.client.force_authenticate(user=self.ops_user)
        response = self.client.get("/api/v1/ops/reports/payments.csv")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Content-Type"], "text/csv")

    def test_export_report_xlsx(self) -> None:
        self.client.force_authenticate(user=self.ops_user)
        response = self.client.get("/api/v1/ops/reports/settlement.xlsx")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response["Content-Type"],
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )

    def test_export_report_pdf(self) -> None:
        self.client.force_authenticate(user=self.ops_user)
        response = self.client.get("/api/v1/ops/reports/wallet.pdf")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Content-Type"], "application/pdf")

    def test_presets_url(self) -> None:
        self.client.force_authenticate(user=self.ops_user)
        response = self.client.get("/api/v1/ops/reports/presets/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_dashboard_kinds(self) -> None:
        self.client.force_authenticate(user=self.ops_user)
        for kind in ["overview", "categories"]:
            response = self.client.get(f"/api/v1/ops/dashboards/{kind}/")
            self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_settlement_execute_does_not_mutate_shared_columns(self) -> None:
        report = get_report("settlement")
        original = list(report.columns)
        report.execute({})
        self.assertEqual(list(report.columns), original)
        self.assertIsInstance(report, SettlementReport)

    def test_pdf_footer_prefers_net_paise_over_row_count(self) -> None:
        label, amount = _pdf_total_label_and_amount(
            ["id", "net_paise", "tds_paise"],
            [{"id": "1", "net_paise": 10000, "tds_paise": 100}],
            {"net_paise": 25000, "tds_paise": 250},
        )
        self.assertEqual(label, "Total Amount")
        self.assertEqual(amount, "₹250.00")
