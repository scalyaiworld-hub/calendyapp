// Lógica pura (sin red ni base de datos) de claves de API y webhooks. Usa Web Crypto, que existe
// tanto en Node como en Cloudflare Workers.

export const MAX_API_KEYS = 10;
export const MAX_WEBHOOKS = 5;
export const MAX_DELIVERY_ATTEMPTS = 6;
export const DISABLE_ENDPOINT_AFTER_FAILURES = 20;
export const WEBHOOK_TIMEOUT_MS = 8000;
export const WEBHOOK_EVENTS = [
  "appointment.created",
  "appointment.updated",
  "appointment.cancelled",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

const toHex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

export function randomToken(bytes = 32): string {
  const raw = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...raw))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function sha256Hex(input: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input)));
}

export const API_KEY_PREFIX = "cal_live_";

/** La clave completa solo existe en este momento: en la base se guarda su hash y un prefijo para reconocerla. */
export async function generateApiKey(): Promise<{ key: string; prefix: string; hash: string }> {
  const key = `${API_KEY_PREFIX}${randomToken(32)}`;
  return { key, prefix: key.slice(0, API_KEY_PREFIX.length + 6), hash: await sha256Hex(key) };
}

export function looksLikeApiKey(value: string): boolean {
  return (
    value.startsWith(API_KEY_PREFIX) &&
    value.length >= API_KEY_PREFIX.length + 32 &&
    value.length <= 120
  );
}

export function generateWebhookSecret(): string {
  return `whsec_${randomToken(32)}`;
}

/** Firma HMAC-SHA256 de `${timestamp}.${body}` (el receptor la recalcula con su secreto). */
export async function signWebhook(
  secret: string,
  timestamp: number | string,
  body: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${body}`)),
  );
}

const BLOCKED_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".lan",
  ".home.arpa",
  ".intranet",
  ".corp",
];

export type UrlCheck = { ok: true; url: string } | { ok: false; reason: string };

/**
 * Valida el destino de un webhook para limitar SSRF: solo https, sin credenciales, puerto 443,
 * nombre de dominio público (nunca IPs ni nombres internos). No puede garantizar a qué IP resuelve
 * el DNS en el momento del envío: por eso además no se siguen redirecciones y no se devuelve el cuerpo.
 */
export function validateWebhookUrl(raw: string): UrlCheck {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return { ok: false, reason: "La URL no es válida." };
  }
  if (u.protocol !== "https:") return { ok: false, reason: "La URL debe empezar con https://" };
  if (u.username || u.password)
    return { ok: false, reason: "La URL no puede llevar usuario ni contraseña." };
  if (u.port && u.port !== "443") return { ok: false, reason: "Solo se permite el puerto 443." };
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (host.startsWith("[") || /^\d+(\.\d+){3}$/.test(host))
    return { ok: false, reason: "Usa un nombre de dominio, no una dirección IP." };
  if (
    !host.includes(".") ||
    host === "localhost" ||
    BLOCKED_SUFFIXES.some((s) => host.endsWith(s))
  ) {
    return { ok: false, reason: "Ese dominio es interno o local y no está permitido." };
  }
  if (u.href.length > 500)
    return { ok: false, reason: "La URL es demasiado larga (máximo 500 caracteres)." };
  return { ok: true, url: u.href };
}

/** Espera antes del siguiente intento, según los intentos ya hechos: 1 min, 5 min, 30 min, 2 h, 6 h. */
export function webhookBackoffMs(attemptsDone: number): number {
  const steps = [1, 5, 30, 120, 360];
  return steps[Math.min(Math.max(attemptsDone, 1), steps.length) - 1] * 60_000;
}
