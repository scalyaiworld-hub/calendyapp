import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { hasModule } from "@/lib/plans";
import { looksLikeApiKey, sha256Hex } from "@/lib/integrations";

type Admin = SupabaseClient<Database>;

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

export function apiError(status: number, code: string, message: string, extra?: HeadersInit) {
  return Response.json(
    { error: { code, message } },
    { status, headers: { ...JSON_HEADERS, ...(extra as object) } },
  );
}
export function apiJson(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: JSON_HEADERS });
}

/**
 * Autentica una petición de la API con `Authorization: Bearer cal_live_...` (o `X-API-Key`).
 * Devuelve el negocio dueño de la clave, o la Response de error lista para devolver.
 * Solo se consulta por el HASH de la clave; la clave en claro nunca se guarda.
 */
export async function authenticateApiRequest(
  request: Request,
  admin: Admin,
): Promise<{ businessId: string } | Response> {
  const header = request.headers.get("authorization") ?? "";
  const key = (
    header.startsWith("Bearer ") ? header.slice(7) : (request.headers.get("x-api-key") ?? "")
  ).trim();
  if (!looksLikeApiKey(key))
    return apiError(
      401,
      "unauthorized",
      "Falta una clave de API válida (Authorization: Bearer cal_live_...).",
      { "WWW-Authenticate": "Bearer" },
    );

  const { data: row, error } = await admin
    .from("api_keys")
    .select("id,business_id,last_used_at,revoked_at")
    .eq("key_hash", await sha256Hex(key))
    .maybeSingle();
  if (error) return apiError(500, "internal", "Error interno.");
  if (!row || row.revoked_at)
    return apiError(401, "unauthorized", "Clave de API inválida o revocada.", {
      "WWW-Authenticate": "Bearer",
    });

  const { data: biz } = await admin
    .from("businesses")
    .select("plan,deleted_at")
    .eq("id", row.business_id)
    .maybeSingle();
  if (!biz || biz.deleted_at || !hasModule(biz.plan, "integrations")) {
    return apiError(403, "plan_required", "El plan del negocio no incluye integraciones.");
  }

  // Marca de uso, como mucho una vez por hora, para no escribir en cada petición.
  if (!row.last_used_at || Date.now() - new Date(row.last_used_at).getTime() > 3600_000) {
    await admin
      .from("api_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", row.id);
  }
  return { businessId: row.business_id };
}

export type PageParams = { limit: number; offset: number; from: string | null; to: string | null };

export function parsePage(url: URL): PageParams | Response {
  const num = (name: string, def: number, min: number, max: number) => {
    const raw = url.searchParams.get(name);
    if (raw === null) return def;
    const n = Number(raw);
    return Number.isInteger(n) && n >= min && n <= max ? n : NaN;
  };
  const limit = num("limit", 50, 1, 100);
  const offset = num("offset", 0, 0, 100_000);
  if (Number.isNaN(limit))
    return apiError(400, "invalid_parameter", "limit debe ser un entero entre 1 y 100.");
  if (Number.isNaN(offset))
    return apiError(400, "invalid_parameter", "offset debe ser un entero entre 0 y 100000.");
  const date = (name: string) => {
    const raw = url.searchParams.get(name);
    if (!raw) return null;
    const t = Date.parse(raw);
    return Number.isNaN(t) ? undefined : new Date(t).toISOString();
  };
  const from = date("from");
  const to = date("to");
  if (from === undefined || to === undefined)
    return apiError(
      400,
      "invalid_parameter",
      "from y to deben ser fechas ISO 8601 (p. ej. 2026-10-01T00:00:00Z).",
    );
  return { limit, offset, from, to };
}

/** Respuesta paginada: se pide una fila de más para saber si hay página siguiente. */
export function pageResponse<T>(rows: T[], p: PageParams) {
  return apiJson({
    data: rows.slice(0, p.limit),
    limit: p.limit,
    offset: p.offset,
    has_more: rows.length > p.limit,
  });
}

/**
 * Nombres de profesionales por id. appointments.professional_id no tiene clave foránea a professionals,
 * así que PostgREST no permite incrustarlos con select(); se consultan aparte.
 */
export async function professionalNames(
  admin: Admin,
  businessId: string,
  ids: (string | null)[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((i): i is string => !!i))];
  if (!unique.length) return new Map();
  const { data } = await admin
    .from("professionals")
    .select("id,name")
    .eq("business_id", businessId)
    .in("id", unique);
  return new Map((data ?? []).map((p) => [p.id, p.name]));
}
