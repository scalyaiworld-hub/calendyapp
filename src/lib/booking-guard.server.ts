import process from "node:process";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BookingError } from "@/lib/booking.server";

export const BOOKING_LIMITS = {
  /** Intentos por IP (en todos los negocios) por hora. */
  PER_IP_PER_HOUR: 10,
  /** Intentos por teléfono y negocio en 24 h. */
  PER_PHONE_PER_DAY: 5,
  /** Reservas pendientes de confirmar que una misma persona puede tener en un negocio. */
  MAX_PENDING_PER_CLIENT: 3,
} as const;

export async function getClientIp(): Promise<string> {
  const { getRequestHeader } = await import("@tanstack/react-start/server");
  const fwd = getRequestHeader("x-forwarded-for");
  return (
    getRequestHeader("cf-connecting-ip") ??
    (fwd ? fwd.split(",")[0].trim() : undefined) ??
    getRequestHeader("x-real-ip") ??
    "unknown"
  );
}

/** Hash de la IP: se guarda para limitar abuso sin almacenar la IP en claro. */
export async function hashIp(ip: string): Promise<string> {
  const salt = process.env.BOOKING_IP_SALT ?? "";
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${ip}`));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Cloudflare Turnstile. Si TURNSTILE_SECRET_KEY no está configurada no se exige
 * (útil en desarrollo); en producción debe estarlo para frenar bots.
 */
export async function verifyCaptcha(token: string | undefined, ip: string): Promise<void> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return;
  if (!token) throw new BookingError("Completa la verificación de seguridad e inténtalo de nuevo");
  const body = new URLSearchParams({ secret, response: token });
  if (ip !== "unknown") body.set("remoteip", ip);
  let ok = false;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
    ok = !!((await res.json()) as { success?: boolean }).success;
  } catch {
    throw new BookingError("No se pudo verificar la seguridad. Inténtalo de nuevo");
  }
  if (!ok) throw new BookingError("La verificación de seguridad falló. Recarga la página e inténtalo de nuevo");
}

/** Limita intentos por IP y por teléfono y registra el intento actual. */
export async function enforceBookingRate(
  sb: SupabaseClient,
  opts: { businessId: string; ipHash: string; phone: string },
): Promise<void> {
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();

  const [byIp, byPhone] = await Promise.all([
    sb.from("booking_attempts").select("id", { count: "exact", head: true }).eq("ip_hash", opts.ipHash).gte("created_at", hourAgo),
    sb
      .from("booking_attempts")
      .select("id", { count: "exact", head: true })
      .eq("business_id", opts.businessId)
      .eq("phone", opts.phone)
      .gte("created_at", dayAgo),
  ]);
  if (byIp.error) throw new Error(byIp.error.message);
  if (byPhone.error) throw new Error(byPhone.error.message);

  if ((byIp.count ?? 0) >= BOOKING_LIMITS.PER_IP_PER_HOUR || (byPhone.count ?? 0) >= BOOKING_LIMITS.PER_PHONE_PER_DAY) {
    throw new BookingError("Demasiados intentos de reserva. Inténtalo más tarde");
  }

  await sb.from("booking_attempts").insert({ business_id: opts.businessId, ip_hash: opts.ipHash, phone: opts.phone });
  // Limpieza ocasional de intentos viejos para que la tabla no crezca sin límite.
  if (Math.random() < 0.02) {
    await sb.from("booking_attempts").delete().lt("created_at", new Date(Date.now() - 2 * 86_400_000).toISOString());
  }
}
