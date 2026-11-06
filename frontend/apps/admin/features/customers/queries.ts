import { request, type Schemas } from "@vsolve/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getApiClient } from "@/lib/api/browser";

export type CustomerRow = Schemas["OperationsCustomerRow"];
export type CustomerPage = Schemas["OperationsCustomerPage"];
export type CustomerRecord = Schemas["OperationsCustomerRecord"];
export type CustomerBooking = Schemas["OperationsCustomerBooking"];

const customerKeys = {
  all: ["ops-customers"] as const,
  record: (id: string) => ["ops-customers", "record", id] as const,
};
export { customerKeys };

/** One page of customers, newest first. `q` is a name, or a mobile number typed any way. */
export function fetchCustomersPage(cursor: string | undefined, q: string): Promise<CustomerPage> {
  return request(() =>
    getApiClient().GET("/api/v1/operations/customers/", {
      params: { query: { ...(q ? { q } : {}), ...(cursor ? { cursor } : {}) } },
    }),
  );
}

export function useCustomerRecord(customerId: string) {
  return useQuery({
    queryKey: customerKeys.record(customerId),
    queryFn: () =>
      request(() =>
        getApiClient().GET("/api/v1/operations/customers/{customer_id}/", {
          params: { path: { customer_id: customerId } },
        }),
      ),
  });
}

/** Block or unblock. The server answers with the refreshed record. */
export function useBlockCustomer(customerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { blocked: boolean; reason: string }) =>
      request(() =>
        getApiClient().POST("/api/v1/operations/customers/{customer_id}/block/", {
          params: { path: { customer_id: customerId } },
          body: input,
        }),
      ),
    onSuccess: (record) => {
      queryClient.setQueryData(customerKeys.record(customerId), record);
      void queryClient.invalidateQueries({ queryKey: [...customerKeys.all, "list"] });
    },
  });
}

/** Where each kind of booking is handled, opened on that booking. */
export function bookingHref(booking: Pick<CustomerBooking, "kind" | "id">): string {
  switch (booking.kind) {
    case "HOME_VISIT":
      return `/operations/visits?id=${booking.id}`;
    case "RENTAL":
      return `/operations/rentals?tab=bookings&q=${booking.id}`;
    case "STAY":
      return `/operations/stays?tab=reservations&q=${booking.id}`;
    case "REQUEST":
      return `/operations/requests/${booking.id}`;
  }
}

export const BOOKING_KIND_LABEL: Record<CustomerBooking["kind"], string> = {
  HOME_VISIT: "Home service",
  RENTAL: "Rental",
  STAY: "Stay",
  REQUEST: "Crew or project",
};
