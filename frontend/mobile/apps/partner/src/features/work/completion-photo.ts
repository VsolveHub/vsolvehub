import { request } from "@vsolve/api-client";
import { describeLocalFile, getApiClient, uploadToSignedUrl } from "@vsolve/mobile-core";
import { useMutation } from "@tanstack/react-query";

/**
 * The optional "after" photo on a job report: grant, upload, finalize.
 *
 * Optional by owner decision (5 November 2026): a report without one still settles, and the
 * Customer still has 24 hours to confirm or dispute. A photo is what Operations looks at when a
 * Customer says the work was not done, so the report screen asks for one and does not insist.
 */

export interface PickedPhoto {
  readonly uri: string;
  readonly mimeType: string;
}

export function useUploadCompletionPhoto(bookingId: string) {
  return useMutation({
    mutationFn: async (photo: PickedPhoto) => {
      const facts = await describeLocalFile(photo.uri);
      const grant = await request(() =>
        getApiClient().POST("/api/v1/partner/bookings/{booking_id}/evidence/uploads/", {
          params: { path: { booking_id: bookingId } },
          body: { kind: "AFTER", content_type: photo.mimeType, size_bytes: facts.sizeBytes },
        }),
      );
      await uploadToSignedUrl({ uri: photo.uri, contentType: photo.mimeType, url: grant.upload_url });
      return request(() =>
        getApiClient().POST("/api/v1/partner/bookings/{booking_id}/evidence/", {
          params: { path: { booking_id: bookingId } },
          body: {
            kind: "AFTER",
            object_key: grant.object_key,
            content_type: photo.mimeType,
            size_bytes: facts.sizeBytes,
            sha256: facts.sha256,
          },
        }),
      );
    },
    retry: false,
  });
}
