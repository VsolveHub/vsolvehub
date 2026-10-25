// A separate entry from `@vsolve/ui` so only the screens that show a map load
// the Google Maps loader. See the component's own note. The read-only
// `MapEmbed` has its own entry (`@vsolve/ui/map-embed`) for the same reason:
// an iframe should not pull in the loader either.
export { LocationPicker } from "./location-picker";
export type { LocationPickerProps, PickedLocation } from "./location-picker";
