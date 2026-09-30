import csv
import io

from django.http import HttpResponse
from rest_framework import permissions, status
from rest_framework.request import Request
from rest_framework.views import APIView

from apps.partners.permissions import IsOperationsUser
from apps.wallet.excel import workbook_bytes

from .models import PayoutBatch


class PayoutBatchBankExportView(APIView):
    permission_classes = (permissions.IsAuthenticated, IsOperationsUser)
    export_format = "csv"

    def get(self, request: Request, pk: str) -> HttpResponse:
        try:
            batch = PayoutBatch.objects.get(pk=pk)
        except PayoutBatch.DoesNotExist:
            return HttpResponse("Batch not found", status=status.HTTP_404_NOT_FOUND)

        items = batch.items.filter(status__in=["RESERVED", "SUBMITTED", "PAID"]).select_related(
            "payout_account", "partner"
        )
        if not items.exists():
            return HttpResponse("Batch has no valid entries", status=status.HTTP_400_BAD_REQUEST)

        rows = []
        for item in items:
            rows.append(
                {
                    "account_last4": getattr(item.payout_account, "account_last4", ""),
                    "ifsc": getattr(item.payout_account, "ifsc", ""),
                    "amount_paise": item.amount_paise,
                    "narration": f"Settlement {batch.reference}",
                    "beneficiary_name": getattr(item.payout_account, "holder_name", "")
                    or getattr(item.partner, "display_name", ""),
                }
            )

        columns = ["account_last4", "ifsc", "amount_paise", "narration", "beneficiary_name"]

        if self.export_format == "csv":
            buffer = io.StringIO()
            writer = csv.DictWriter(buffer, fieldnames=columns)
            writer.writeheader()
            writer.writerows(rows)
            content = buffer.getvalue().encode("utf-8")
            content_type = "text/csv"
            filename = f"bank-export-{batch.reference}.csv"
        else:
            list_rows = [[row[c] for c in columns] for row in rows]
            content = workbook_bytes(sheet_name="Bank Export", headers=columns, rows=list_rows)
            content_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            filename = f"bank-export-{batch.reference}.xlsx"

        response = HttpResponse(content, content_type=content_type)
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response
