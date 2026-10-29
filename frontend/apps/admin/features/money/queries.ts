import { request, type Schemas } from "@vsolve/api-client";

import { getApiClient } from "@/lib/api/browser";

/**
 * One marketplace service's money, for its Money tab. The server reads only that service's
 * records, so the Rentals tab can never show stays money.
 */

export type MoneyService = "rentals" | "stays" | "listings";
export type MoneyPeriod = "this_month" | "last_month" | "all";
export type MoneySummary = Schemas["MoneySummary"];
export type MoneyPayment = Schemas["MoneyPayment"];

export const PERIOD_LABELS: Record<MoneyPeriod, string> = {
  this_month: "This month",
  last_month: "Last month",
  all: "All time",
};

export function moneySummaryKey(service: MoneyService, period: MoneyPeriod) {
  return ["ops-money", service, period] as const;
}

export function fetchMoneySummary(service: MoneyService, period: MoneyPeriod) {
  const client = getApiClient();
  const query = { params: { query: { period } } };
  switch (service) {
    case "rentals":
      return request(() => client.GET("/api/v1/ops/rentals/money", query));
    case "stays":
      return request(() => client.GET("/api/v1/ops/stays/money", query));
    case "listings":
      return request(() => client.GET("/api/v1/ops/listings/money", query));
  }
}

export function fetchMoneyPayments(
  service: MoneyService,
  period: MoneyPeriod,
  offset: number,
  limit: number,
) {
  const client = getApiClient();
  const query = { params: { query: { period, offset, limit } } };
  switch (service) {
    case "rentals":
      return request(() => client.GET("/api/v1/ops/rentals/money/payments", query));
    case "stays":
      return request(() => client.GET("/api/v1/ops/stays/money/payments", query));
    case "listings":
      return request(() => client.GET("/api/v1/ops/listings/money/payments", query));
  }
}
