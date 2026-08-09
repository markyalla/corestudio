import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "corestudio_token";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
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

export interface SignupInput {
  name: string;
  email: string;
  phone: string;
  password: string;
}

/** Creates the account (unverified) and triggers an OTP SMS to `phone`. */
export function signup(input: SignupInput) {
  return api<{ ok: true; next: "VERIFY_PHONE" }>("/api/signup", { method: "POST", body: input });
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
