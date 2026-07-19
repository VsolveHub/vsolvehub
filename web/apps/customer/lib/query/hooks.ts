import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, PaymentMethod } from "./api";
import { qk } from "./keys";

export function useSessionQuery() {
  return useQuery({
    queryKey: qk.session(),
    queryFn: api.session,
  });
}

export function useAddressesQuery(options?: { enabled?: boolean; initialData?: any }) {
  return useQuery({
    queryKey: qk.addresses(),
    queryFn: api.addresses,
    ...options,
  });
}

export function useNotificationsQuery(audience: "customer" | "provider" = "customer") {
  return useQuery({
    queryKey: qk.notifications(audience),
    queryFn: () => api.notifications(audience),
  });
}

export function useCatalogQuery() {
  return useQuery({
    queryKey: qk.catalog(),
    queryFn: api.catalog,
  });
}

export function useBookingQuery(ref: string, options?: { enabled?: boolean; refetchInterval?: number }) {
  return useQuery({
    queryKey: qk.booking(ref),
    queryFn: () => api.booking(ref),
    ...options,
  });
}

export function useAddAddressMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.addAddress,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.addresses() });
    },
  });
}

export function useSelectAddressMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.selectAddress,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.addresses() });
    },
  });
}

export function useDeleteAddressMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.deleteAddress,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.addresses() });
    },
  });
}

export function useLogoutMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.logout,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.session() });
    },
  });
}

export function useUpdateProfileMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.updateProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.session() });
    },
  });
}

export function useTrackRecentlyViewedMutation() {
  return useMutation({
    mutationFn: api.trackRecentlyViewed,
  });
}

export function useSaveServiceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.saveService,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.savedServices() });
    },
  });
}

export function useUnsaveServiceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.unsaveService,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.savedServices() });
    },
  });
}

export function useCreateBookingMutation() {
  return useMutation({
    mutationFn: api.createBooking,
  });
}

export function usePayBookingMutation(ref: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (paymentMethod: PaymentMethod) => api.payBooking(ref, paymentMethod),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.booking(ref) });
    },
  });
}

export function useCancelBookingMutation(ref: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.cancelBooking(ref),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.booking(ref) });
    },
  });
}

export function useReviewBookingMutation(ref: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ rating, review }: { rating: number; review: string }) =>
      api.reviewBooking(ref, rating, review),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.booking(ref) });
    },
  });
}

export function useReviseBookingMutation(ref: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (action: "approve" | "decline") => api.reviseBooking(ref, action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.booking(ref) });
    },
  });
}

export function useRetryBookingMutation(ref: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.retryBooking(ref),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.booking(ref) });
    },
  });
}

export function useVehicleBookingQuery(ref: string, options?: { enabled?: boolean; refetchInterval?: number }) {
  return useQuery({
    queryKey: qk.vehicleBooking(ref),
    queryFn: () => api.vehicleBooking(ref),
    ...options,
  });
}

export function useCancelVehicleBookingMutation(ref: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.cancelVehicleBooking(ref),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.vehicleBooking(ref) });
    },
  });
}

export function useSimulateVehicleStatusMutation(ref: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { nextStatus } = await api.getVehicleNextStatus(ref);
      if (nextStatus) {
        return api.setVehicleStatus(ref, nextStatus);
      }
      return null;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.vehicleBooking(ref) });
    },
  });
}

export function useResetVehicleSimulationMutation(ref: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.setVehicleStatus(ref, "REQUESTED"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.vehicleBooking(ref) });
    },
  });
}

export function useSimulateBookingStatusMutation(ref: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { nextStatus } = await api.getBookingNextStatus(ref);
      if (nextStatus) {
        return api.setBookingStatus(ref, nextStatus);
      }
      return null;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.booking(ref) });
    },
  });
}

export function useSetBookingStatusMutation(ref: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (status: string) => api.setBookingStatus(ref, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.booking(ref) });
    },
  });
}

export function useCancelCrewBookingMutation(ref: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.cancelCrewBooking(ref),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.booking(ref) });
    },
  });
}

export function usePayCrewBookingMutation(ref: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (paymentMethod: string) => api.payCrewBooking(ref, paymentMethod),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.booking(ref) });
    },
  });
}

export function usePostCrewActionMutation(ref: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ path, body }: { path: string; body?: any }) => api.postCrewAction(ref, path, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.booking(ref) });
    },
  });
}

export function useApproveCrewExtensionMutation(ref: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (paymentMethod: string) => api.approveCrewExtension(ref, paymentMethod),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.booking(ref) });
    },
  });
}

export function useRescheduleCrewBookingMutation(ref: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: any) => api.rescheduleCrewBooking(ref, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.booking(ref) });
    },
  });
}

export function useRetryCrewBookingMutation(ref: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.retryCrewBooking(ref),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.booking(ref) });
    },
  });
}
