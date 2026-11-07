/**
 * Which approved partners get the workspace on a computer.
 *
 * Field work (the SERVICES track: technicians and crew) happens on a phone: jobs, navigation
 * and payouts. Stay hosts, rental owners and employers run listings and bookings from a desk,
 * so they get the full workspace on any screen. A track this build doesn't know stays
 * phone-only, the stricter reading.
 */
const DESK_TRACKS = new Set(["STAY_HOST", "RENTAL_OWNER", "EMPLOYER"]);

export function isPhoneOnlyTrack(track: string | null | undefined): boolean {
  return !track || !DESK_TRACKS.has(track);
}
