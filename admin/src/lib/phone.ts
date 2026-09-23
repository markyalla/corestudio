// Country dial codes for the phone inputs across admin forms. Ghana first —
// it's the default selection everywhere since the studio is Accra-based.
export const COUNTRIES: { name: string; iso2: string; dialCode: string }[] = [
  { name: "Ghana", iso2: "GH", dialCode: "+233" },
  { name: "Nigeria", iso2: "NG", dialCode: "+234" },
  { name: "Côte d'Ivoire", iso2: "CI", dialCode: "+225" },
  { name: "Togo", iso2: "TG", dialCode: "+228" },
  { name: "Benin", iso2: "BJ", dialCode: "+229" },
  { name: "Burkina Faso", iso2: "BF", dialCode: "+226" },
  { name: "Senegal", iso2: "SN", dialCode: "+221" },
  { name: "Mali", iso2: "ML", dialCode: "+223" },
  { name: "Niger", iso2: "NE", dialCode: "+227" },
  { name: "Guinea", iso2: "GN", dialCode: "+224" },
  { name: "Sierra Leone", iso2: "SL", dialCode: "+232" },
  { name: "Liberia", iso2: "LR", dialCode: "+231" },
  { name: "The Gambia", iso2: "GM", dialCode: "+220" },
  { name: "Cameroon", iso2: "CM", dialCode: "+237" },
  { name: "Kenya", iso2: "KE", dialCode: "+254" },
  { name: "Uganda", iso2: "UG", dialCode: "+256" },
  { name: "Tanzania", iso2: "TZ", dialCode: "+255" },
  { name: "Rwanda", iso2: "RW", dialCode: "+250" },
  { name: "Ethiopia", iso2: "ET", dialCode: "+251" },
  { name: "South Africa", iso2: "ZA", dialCode: "+27" },
  { name: "Zimbabwe", iso2: "ZW", dialCode: "+263" },
  { name: "Zambia", iso2: "ZM", dialCode: "+260" },
  { name: "Egypt", iso2: "EG", dialCode: "+20" },
  { name: "Morocco", iso2: "MA", dialCode: "+212" },
  { name: "Algeria", iso2: "DZ", dialCode: "+213" },
  { name: "Tunisia", iso2: "TN", dialCode: "+216" },
  { name: "United Kingdom", iso2: "GB", dialCode: "+44" },
  { name: "United States", iso2: "US", dialCode: "+1" },
  { name: "Canada", iso2: "CA", dialCode: "+1" },
  { name: "Germany", iso2: "DE", dialCode: "+49" },
  { name: "France", iso2: "FR", dialCode: "+33" },
  { name: "Netherlands", iso2: "NL", dialCode: "+31" },
  { name: "Belgium", iso2: "BE", dialCode: "+32" },
  { name: "Spain", iso2: "ES", dialCode: "+34" },
  { name: "Italy", iso2: "IT", dialCode: "+39" },
  { name: "Portugal", iso2: "PT", dialCode: "+351" },
  { name: "Switzerland", iso2: "CH", dialCode: "+41" },
  { name: "Sweden", iso2: "SE", dialCode: "+46" },
  { name: "Norway", iso2: "NO", dialCode: "+47" },
  { name: "Denmark", iso2: "DK", dialCode: "+45" },
  { name: "Ireland", iso2: "IE", dialCode: "+353" },
  { name: "India", iso2: "IN", dialCode: "+91" },
  { name: "China", iso2: "CN", dialCode: "+86" },
  { name: "United Arab Emirates", iso2: "AE", dialCode: "+971" },
  { name: "Saudi Arabia", iso2: "SA", dialCode: "+966" },
  { name: "Qatar", iso2: "QA", dialCode: "+974" },
  { name: "Australia", iso2: "AU", dialCode: "+61" },
  { name: "Brazil", iso2: "BR", dialCode: "+55" },
];

export const DEFAULT_DIAL_CODE = "+233";

/** Combines a dial code with a locally-entered number into the +digits form
 *  the backend expects — strips everything but digits and drops a leading
 *  trunk "0" (e.g. dial "+233" + local "0542512558" -> "+233542512558"). */
export function combinePhone(dialCode: string, local: string): string {
  const digits = local.replace(/\D/g, "").replace(/^0+/, "");
  return digits ? `${dialCode}${digits}` : "";
}
