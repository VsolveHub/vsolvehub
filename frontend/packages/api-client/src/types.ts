/**
 * Ergonomic aliases over the generated contract types.
 *
 * These are aliases, not redefinitions — they resolve to the generated schema,
 * so they cannot drift from the contract. If Codex renames or removes a schema,
 * typecheck fails here, which is the intended early warning.
 *
 * Prefer `Schemas["SomeName"]` for anything not aliased below rather than
 * writing a local interface.
 */
import type { components } from "./generated/schema";

export type Schemas = components["schemas"];

// Identity
export type User = Schemas["User"];
export type UserSession = Schemas["UserSession"];
export type AuthenticatedSession = Schemas["AuthenticatedSession"];
export type OtpIssued = Schemas["OtpIssued"];
export type OtpRequest = Schemas["OtpRequestRequest"];
export type OtpVerify = Schemas["OtpVerifyRequest"];

// Catalog
export type Category = Schemas["Category"];
export type Subcategory = Schemas["Subcategory"];
export type ServiceCard = Schemas["ServiceCard"];
export type ServiceDetail = Schemas["ServiceDetail"];
export type ServiceMedia = Schemas["ServiceMedia"];
export type ServicePolicy = Schemas["ServicePolicy"];
export type ServiceQuestion = Schemas["ServiceQuestion"];
export type ServiceQuestionOption = Schemas["ServiceQuestionOption"];
export type ServiceVariantConfiguration = Schemas["ServiceVariantConfiguration"];

// Locations
export type Address = Schemas["Address"];
export type AddressRequest = Schemas["AddressRequest"];
export type PatchedAddressRequest = Schemas["PatchedAddressRequest"];
export type ServiceArea = Schemas["ServiceArea"];
export type ReverseGeocodeResponse = Schemas["ReverseGeocodeResponse"];
export type ServiceabilityResponse = Schemas["ServiceabilityResponse"];

/**
 * Money is always integer paise plus a currency code. Never do arithmetic on a
 * formatted string, and never let the client compute a total the server owns.
 */
export type Money = Schemas["Money"];
