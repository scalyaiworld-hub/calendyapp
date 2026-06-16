## Resumen del diagnóstico

La auditoría encontró 10 hallazgos. Los más graves:

1. **El candado anti-doble-reserva está mal definido** — bloquea por negocio, no por profesional. Hoy mismo dos profesionales del mismo salón no pueden atender a dos clientes en paralelo.
2. **Los límites del plan Free son decorativos** — sólo viven en pantalla. Cualquiera puede crear 1.000 citas, 10 sucursales o 50 profesionales en Free llamando directo a la API.
3. **La reserva pública confía en el navegador** — el servidor no revisa horario, ventana mínima ni choque de citas. Si alguien edita la petición en consola, pasa.
4. **Los clientes duplicados son inevitables** — la unicidad no incluye el código de país y el teléfono no se normaliza. Mismo cliente puede aparecer 3 veces.
5. **Los contadores `no_show_count` y `total_appointments` no se mantienen solos** — los números del dashboard van mintiendo poco a poco.

## Plan de implementación

### Fase 1 — Base de datos (1 sola migración)

```text
1. Reemplazar el EXCLUDE constraint de appointments
   ├─ Drop del actual (scope business_id)
   ├─ Nuevo EXCLUDE por professional_id (cuando hay profesional)
   └─ Segundo EXCLUDE por location_id (cuando no hay profesional asignado)

2. Reglas de plan en businesses
   ├─ CHECK (plan IN ('free','pro','studio'))
   └─ Función public.enforce_plan_limits() + triggers BEFORE INSERT
      en appointments, locations, professionals

3. Sincronizar contadores de clients
   └─ Trigger AFTER INSERT/UPDATE/DELETE en appointments
      que recalcula no_show_count, total_appointments, last_visit_at

4. Validar transiciones de estado
   └─ Trigger BEFORE UPDATE en appointments
      bloquea reabrir completed/cancelled y editar fechas de citas pasadas
      (con bypass por rol service_role)

5. Deduplicación de clients
   ├─ Drop UNIQUE (business_id, phone)
   ├─ Función normalize_phone(text) — strip espacios/guiones/paréntesis
   ├─ Trigger BEFORE INSERT/UPDATE para normalizar phone
   └─ UNIQUE INDEX (business_id, phone_country_code, phone)
      WHERE deleted_at IS NULL
```

### Fase 2 — Server functions

```text
src/lib/api/public-booking.functions.ts
└─ createPublicBooking refuerza:
   ├─ starts_at >= now() + 30 min
   ├─ starts_at < now() + 90 días
   ├─ Re-verifica horario contra location_hours / availability_rules
   ├─ Re-verifica que el slot esté libre (consulta atómica)
   ├─ Normaliza phone antes de buscar/insertar cliente
   └─ Usa INSERT ... ON CONFLICT para el upsert de cliente

src/lib/api/limits.functions.ts (nuevo)
└─ canCreateResource({ kind: 'appointment'|'location'|'professional' })
   Devuelve { allowed, used, limit, planLabel } para mostrar en UI

src/lib/api/appointments.functions.ts (nuevo)
└─ Mueve updateAppointmentStatus y saveAppointment a server fn
   con validación de transición y de fecha
```

### Fase 3 — Frontend (sólo wiring + mensajes)

```text
- dashboard.citas.tsx → llamar a las server fn nuevas en vez de supabase.update directo
- dashboard.sucursales.tsx / .profesionales.tsx → bloquear botón "Nuevo" cuando se alcanza el límite, con CTA a /planes
- Mostrar el error de límite/horario/choque con un toast claro
  (no exponer mensajes de Postgres al usuario)
```

## Lo que NO toco en este plan

- Recordatorios de WhatsApp (Pro/Studio) — son un módulo aparte con costo de proveedor, lo veremos por separado.
- UI de merge manual de clientes duplicados — sólo evitamos crear nuevos; los históricos se limpian después.
- Política de cancelación con antelación configurable — se puede añadir en una segunda iteración cuando definas las reglas por plan.

## Impacto en Lovable Cloud (costo)

Todo el enforcement vive en triggers y server functions ya existentes — **no añade peticiones nuevas**, sólo añade `COUNT(*)` y `EXISTS` dentro de inserts que ya ocurrían. El conteo del mes se hace en el momento del INSERT, no en cada render del dashboard.

## Detalles técnicos

- Constraints `EXCLUDE USING gist` requieren la extensión `btree_gist` (verifico antes y la habilito si falta).
- Los triggers de límite usan `SECURITY DEFINER` con `search_path = public` y leen `businesses.plan` con una sola query indexada.
- La normalización de teléfono se hace tanto en trigger DB (verdad última) como en la server fn (mejor mensaje de error al usuario).
- Las transiciones se documentan como matriz en un comentario SQL para que sea fácil cambiarlas después.
- Todo se entrega en **una sola migración** + **3 archivos `.functions.ts`** editados/creados + retoques de UI.

## Orden de ejecución

1. Migración (incluye recálculo inicial de `no_show_count`/`total_appointments` de los clientes existentes).
2. Server functions.
3. UI.
4. Smoke test: reservar la misma hora con 2 profesionales (debe permitir), intentar crear cita #51 en Free (debe bloquear), reservar con teléfono `"+51 999 123 456"` y luego `"51999123456"` (debe deduplicar).

¿Le doy luz verde así, o quieres ajustar algo (por ejemplo, dejar fuera el bloqueo de límites del plan Free hasta que lances pagos)?