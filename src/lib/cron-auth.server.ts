import process from "node:process";

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Valida las llamadas del cron (pg_cron + pg_net) con el secreto REMINDERS_CRON_SECRET.
 * Devuelve una Response de error si no pasa, o null si puede continuar. Sin secreto (o muy corto)
 * la ruta queda cerrada, nunca abierta.
 */
export function checkCronAuth(request: Request): Response | null {
  const secret = process.env.REMINDERS_CRON_SECRET;
  if (!secret || secret.length < 16) return new Response("Not configured", { status: 503 });
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  return safeEqual(token, secret) ? null : new Response("Unauthorized", { status: 401 });
}
