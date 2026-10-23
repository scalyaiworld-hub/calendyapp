// Lógica pura (sin red ni base de datos) de la sincronización con Google Calendar. Usa Web Crypto,
// que existe tanto en Node como en Cloudflare Workers.
import { appointmentDescription } from "@/lib/ics";

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
];
export const BACKFILL_DAYS = 180;
export const STATE_TTL_MS = 10 * 60_000;
/** Se refresca el access token si le queda menos que esto. */
export const TOKEN_REFRESH_MARGIN_MS = 60_000;

export type GoogleOAuthConfig = {
  clientId: string;
  clientSecret: string;
  /** 32 bytes en base64: de ella se derivan la clave de cifrado de tokens y la de firma del state. */
  encKey: string;
  redirectUri: string;
};

const enc = new TextEncoder();
const dec = new TextDecoder();

const toB64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

function fromB64(value: string): Uint8Array<ArrayBuffer> {
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function deriveKey(
  encKeyB64: string,
  info: string,
  algorithm: AesKeyGenParams | HmacImportParams,
  usages: KeyUsage[],
): Promise<CryptoKey> {
  const raw = fromB64(encKeyB64.trim());
  if (raw.length !== 32) throw new Error("GOOGLE_TOKEN_ENC_KEY debe tener 32 bytes en base64.");
  const master = await crypto.subtle.importKey("raw", raw, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: enc.encode(info) },
    master,
    algorithm,
    false,
    usages,
  );
}

const tokenKey = (k: string) =>
  deriveKey(k, "calendya/google-calendar/tokens", { name: "AES-GCM", length: 256 }, [
    "encrypt",
    "decrypt",
  ]);
const stateKey = (k: string) =>
  deriveKey(k, "calendya/google-calendar/oauth-state", { name: "HMAC", hash: "SHA-256" }, [
    "sign",
    "verify",
  ]);

/** AES-GCM con IV aleatorio. Formato: `base64url(iv).base64url(ciphertext+tag)`. */
export async function encryptToken(plain: string, encKeyB64: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await tokenKey(encKeyB64),
    enc.encode(plain),
  );
  return `${toB64Url(iv)}.${toB64Url(new Uint8Array(ct))}`;
}

/** Lanza si el texto fue alterado o la clave no es la misma. */
export async function decryptToken(value: string, encKeyB64: string): Promise<string> {
  const [iv, ct] = value.split(".");
  if (!iv || !ct) throw new Error("Token cifrado con formato no válido.");
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(iv) },
    await tokenKey(encKeyB64),
    fromB64(ct),
  );
  return dec.decode(plain);
}

export type OAuthState = { businessId: string; userId: string; exp: number; nonce: string };

/** State firmado (HMAC) que viaja a Google y vuelve en el callback: `base64url(json).base64url(firma)`. */
export async function signState(
  input: { businessId: string; userId: string },
  encKeyB64: string,
  now = Date.now(),
): Promise<string> {
  const payload: OAuthState = {
    businessId: input.businessId,
    userId: input.userId,
    exp: now + STATE_TTL_MS,
    nonce: toB64Url(crypto.getRandomValues(new Uint8Array(12))),
  };
  const body = toB64Url(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", await stateKey(encKeyB64), enc.encode(body));
  return `${body}.${toB64Url(new Uint8Array(sig))}`;
}

/** Devuelve el contenido si la firma es válida y no caducó; si no, null. */
export async function verifyState(
  token: string,
  encKeyB64: string,
  now = Date.now(),
): Promise<OAuthState | null> {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify(
      "HMAC",
      await stateKey(encKeyB64),
      fromB64(sig),
      enc.encode(body),
    );
    if (!ok) return null;
    const payload = JSON.parse(dec.decode(fromB64(body))) as OAuthState;
    if (typeof payload.exp !== "number" || payload.exp < now) return null;
    if (typeof payload.businessId !== "string" || typeof payload.userId !== "string") return null;
    return payload;
  } catch {
    return null;
  }
}

export function buildAuthUrl(
  cfg: Pick<GoogleOAuthConfig, "clientId" | "redirectUri">,
  state: string,
): string {
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export type GoogleEventInput = {
  id: string;
  status: string;
  startsAt: string;
  endsAt: string;
  serviceName: string | null;
  clientName: string | null;
  clientPhone: string | null;
  professionalName: string | null;
  notes: string | null;
  timeZone: string;
  sourceUrl?: string | null;
};

export type GoogleEventBody = {
  summary: string;
  description: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  status: "confirmed" | "tentative";
  extendedProperties: { private: { calendyaAppointmentId: string } };
  reminders: { useDefault: true };
  source?: { title: string; url: string };
};

/** Evento sin invitados: el cliente nunca recibe correos de Google. */
export function toGoogleEvent(a: GoogleEventInput): GoogleEventBody {
  return {
    summary: `${a.serviceName ?? "Cita"} — ${a.clientName ?? "Cliente"}`,
    description: appointmentDescription({
      phone: a.clientPhone,
      professional: a.professionalName,
      notes: a.notes,
    }),
    start: { dateTime: new Date(a.startsAt).toISOString(), timeZone: a.timeZone },
    end: { dateTime: new Date(a.endsAt).toISOString(), timeZone: a.timeZone },
    status: a.status === "pending" ? "tentative" : "confirmed",
    extendedProperties: { private: { calendyaAppointmentId: a.id } },
    reminders: { useDefault: true },
    ...(a.sourceUrl ? { source: { title: "Calendya", url: a.sourceUrl } } : {}),
  };
}

export function pickTargetCalendar(
  professionalId: string | null,
  map: Map<string, string>,
  defaultCalendarId: string,
): string {
  return (professionalId && map.get(professionalId)) || defaultCalendarId;
}

/** Las citas canceladas o no presentadas no tienen evento en Google. */
export function isActiveForSync(status: string): boolean {
  return status === "pending" || status === "booked" || status === "completed";
}
