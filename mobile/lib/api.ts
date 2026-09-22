import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "corestudio_token";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";

/** photoUrl fields come back as a relative "/api/media/…" path (same-origin
 *  fine for the web admin, but native <Image> needs an absolute URL). */
export function mediaUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  return path.startsWith("/") ? `${API_URL}${path}` : path;
}

// expo-secure-store has no web implementation (its web build is an empty
// stub), so on web we fall back to localStorage. Fine for browser demos;
// native builds keep using the real Keychain/Keystore-backed SecureStore.
export async function getToken(): Promise<string | null> {
  if (Platform.OS === "web") return window.localStorage.getItem(TOKEN_KEY);
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  if (Platform.OS === "web") {
    window.localStorage.setItem(TOKEN_KEY, token);
    return;
  }
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  if (Platform.OS === "web") {
    window.localStorage.removeItem(TOKEN_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Thin fetch wrapper: base URL + bearer token + JSON in/out. Throws
 *  ApiError(401) on an expired/invalid token — callers should route back to
 *  the login screen when that happens (see AuthProvider). */
export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${API_URL}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    if (res.status === 401) await clearToken();
    throw new ApiError(res.status, body.error ?? "Request failed");
  }
  return res.json() as Promise<T>;
}

export async function login(email: string, password: string) {
  const data = await api<{ token: string; user: { id: string; name: string; email: string; role: string } }>(
    "/api/app/auth/login",
    { method: "POST", body: { email, password } },
  );
  await setToken(data.token);
  return data.user;
}

/** Invalidates every bearer token issued for this account — including the
 *  one this call itself used — so a lost/stolen device stops working
 *  immediately. Every other signed-in device is forced back to /login. */
export function logoutAllDevices() {
  return api<{ ok: true }>("/api/app/auth/logout-all", { method: "POST" });
}

export interface SignupInput {
  name: string;
  email: string;
  phone: string;
  password: string;
}

/** Creates the member account. Phone verification (OTP) is off until an SMS
 *  provider is configured — see verifyPhoneOtp/resendPhoneOtp below for when
 *  it's re-enabled. */
export function signup(input: SignupInput) {
  return api<{ ok: true }>("/api/signup", { method: "POST", body: input });
}

export function verifyPhoneOtp(phone: string, code: string) {
  return api<{ ok: true; verified: true }>("/api/otp", {
    method: "POST",
    body: { action: "VERIFY", phone, purpose: "VERIFY_PHONE", code },
  });
}

export function resendPhoneOtp(phone: string) {
  return api<{ ok: true }>("/api/otp", {
    method: "POST",
    body: { action: "SEND", phone, purpose: "VERIFY_PHONE" },
  });
}

/** Confirms a Paystack payment after the in-app checkout browser closes —
 *  idempotent with the webhook, so it's safe to call even if the webhook
 *  already fulfilled it. */
export function verifyPayment(reference: string) {
  return api<{ status: string }>(
    `/api/app/pay/verify?reference=${encodeURIComponent(reference)}`,
  );
}

export interface PlanOption {
  id: string;
  name: string;
  priceGHS: number;
  classesPerCycle: number;
  bonusCredits: number;
  cycleDays: number;
  description: string;
  perks: string[];
}

export function getPlans() {
  return api<{ plans: PlanOption[] }>("/api/app/plans");
}

export function subscribeToPlan(planId: string) {
  return api<{ authorizationUrl: string; reference: string }>(
    `/api/app/plans/${planId}/subscribe`,
    { method: "POST" },
  );
}

export function subscribeToPlanWithCash(planId: string) {
  return api<{ cash: true; paymentId: string }>(
    `/api/app/plans/${planId}/subscribe`,
    { method: "POST", body: { method: "cash" } },
  );
}

export interface PackageOption {
  id: string;
  name: string;
  classTypeName: string;
  classTypeDescription: string;
  durationMins: number;
  sessionsGranted: number;
  priceGHS: number;
  validDays: number;
  perks: string[];
}

export interface MyPackage {
  id: string;
  name: string;
  classTypeName: string;
  classTypeDescription: string;
  sessionsLeft: number;
  expiresAt: string;
  perks: string[];
}

/** Purchasable packages plus the member's own active ones (unexpired, with
 *  sessions left) — one-time bundles for a single service, separate from
 *  recurring plan credits. */
export function getPackages() {
  return api<{ packages: PackageOption[]; myPackages: MyPackage[] }>("/api/app/packages");
}

export function subscribeToPackage(packageId: string) {
  return api<{ authorizationUrl: string; reference: string }>(
    `/api/app/packages/${packageId}/subscribe`,
    { method: "POST" },
  );
}

export function subscribeToPackageWithCash(packageId: string) {
  return api<{ cash: true; paymentId: string }>(
    `/api/app/packages/${packageId}/subscribe`,
    { method: "POST", body: { method: "cash" } },
  );
}

/** Renew the member's current plan, paying in cash at the studio — staff
 *  confirm the pending payment in the admin portal, which tops up credits. */
export function renewPlanWithCash() {
  return api<{ cash: true; paymentId: string }>("/api/app/renew", {
    method: "POST",
    body: { method: "cash" },
  });
}

export function bookSessionWithCash(sessionId: string) {
  return api<{ booking?: any }>(
    `/api/app/bookings`,
    { method: "POST", body: { sessionId, method: "cash", reference: "manual" } },
  );
}

export interface ContactLocation {
  id: string;
  name: string;
  address: string;
  phone: string;
}

export interface ContactInfo {
  contactEmail: string;
  whatsapp: string;
  locations: ContactLocation[];
}

export function getContact() {
  return api<ContactInfo>("/api/app/contact");
}

export interface LocationOption {
  id: string;
  name: string;
  address: string;
}

/** Active studio locations the member can pick as their preferred location. */
export function getMemberLocations() {
  return api<{ locations: LocationOption[] }>("/api/app/locations");
}

/** Sets (or clears, with null) the member's preferred studio location. */
export function setPreferredLocation(locationId: string | null) {
  return api<{ ok: true }>("/api/app/profile", {
    method: "PATCH",
    body: { preferredLocationId: locationId },
  });
}

export type AnnouncementKind = "ANNOUNCEMENT" | "PROMOTION";

export interface Announcement {
  id: string;
  kind: AnnouncementKind;
  title: string;
  body: string;
  imageUrl: string | null;
  createdAt: string;
}

export function getAnnouncements() {
  return api<{ announcements: Announcement[] }>("/api/app/announcements");
}

export type ProgressTier =
  | "GETTING_STARTED"
  | "THRIVING"
  | "ON_TRACK"
  | "SLIPPING"
  | "INACTIVE";

export interface ProgressResponse {
  stats: {
    attendedTotal: number;
    attendedThisMonth: number;
    streakWeeks: number;
    attendanceRate: number | null;
    perWeek: number;
    upcoming: number;
    creditsLeft: number;
    daysToRenewal: number | null;
  };
  tier: ProgressTier;
  headline: string;
  message: string;
  tips: string[];
}

/** Attendance progress + a tiered encouragement/advice message for Home. */
export function getProgress() {
  return api<ProgressResponse>("/api/app/progress");
}

/** Today's motivational line (rotates daily). `text` is null when the pool is empty. */
export function getMotivation() {
  return api<{ text: string | null }>("/api/app/motivation");
}

export interface PtRange {
  start: string; // "HH:mm"
  end: string; // "HH:mm"
  durationMins: number;
  priceGHS: number;
  locationId: string;
  locationName: string;
}

export interface PtDay {
  date: string; // "YYYY-MM-DD"
  ranges: PtRange[];
}

export interface PtOffering {
  trainerId: string;
  trainerName: string;
  specialty: string;
  bio: string;
  photoUrl: string | null;
  calendarColor: string;
  title: string;
  durationMins: number;
  priceGHS: number;
  stepMins: number;
  days: PtDay[];
}

/** Private (one-on-one) class offerings: trainers with availability + the
 *  concrete days/time-ranges a member can book. */
export function getPtOfferings() {
  return api<{ offerings: PtOffering[] }>("/api/app/pt");
}

/** Books a private class at a chosen day + start time. Returns a booking, a
 *  Paystack checkout URL, or a cash-pending confirmation — same shapes as the
 *  group-class booking endpoint. */
export function bookPrivateClass(input: {
  trainerId: string;
  date: string;
  startTime: string;
  method?: "cash";
}) {
  return api<{
    booking?: unknown;
    authorizationUrl?: string;
    reference?: string;
    cash?: true;
  }>("/api/app/pt/book", { method: "POST", body: input });
}
