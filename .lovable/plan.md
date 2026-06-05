
## Resumen

Agregar un módulo de **Sucursales** con sus propios profesionales y servicios, y rediseñar el link público de reservas en 3 pasos: Sucursal → (Profesional o Servicio) → Fecha/Hora.

---

## 1. Cambios en la base de datos (nuevas tablas)

**`locations` (sucursales)**
- `business_id`, `name`, `address`, `phone`, `phone_country_code`, `is_active`

**`location_hours` (horario de atención por sucursal)**
- `location_id`, `day_of_week` (0–6), `start_time`, `end_time`

**`professionals` (profesionales)**
- `business_id`, `name`, `phone`, `phone_country_code`, `avatar_url`, `is_active`

**`location_professionals`** (qué profesionales trabajan en cada sucursal)
- `location_id`, `professional_id`, `UNIQUE(location_id, professional_id)`

**`professional_services`** (qué servicios ofrece cada profesional)
- `professional_id`, `service_id`, `UNIQUE(professional_id, service_id)`

**Modificar `appointments`**: agregar `location_id` y `professional_id` (nullables al inicio para no romper datos existentes).

**RLS**:
- `authenticated`: dueño del negocio (vía `is_business_owner`) gestiona todo.
- `anon`: SELECT público sobre `locations`, `professionals`, `location_professionals`, `professional_services`, `location_hours` para que el link público pueda leer.
- INSERT público en `appointments` ya existe; se valida que `location_id`/`professional_id` pertenezcan al `business_id`.

---

## 2. Nueva sección en el dashboard: Sucursales

Ruta nueva: `src/routes/dashboard.sucursales.tsx`

- Lista de sucursales en cards (nombre, dirección, teléfono, # de profesionales).
- Botón "Nueva sucursal" → diálogo con:
  - Datos básicos (nombre, dirección, teléfono con `PhoneInput`).
  - Horario semanal (7 días, hora inicio/fin, toggle "cerrado").
  - Selector múltiple de profesionales asignados.
- Editar / eliminar (soft delete con `is_active=false`).

Subsección o tab "Profesionales" dentro de Sucursales:
- CRUD de profesionales del negocio.
- Por cada profesional, seleccionar los servicios que ofrece (multi-select desde la lista existente de servicios).

Agregar el item "Sucursales" al menú lateral del dashboard.

---

## 3. Rediseño del link público `b/$slug`

Reescribir `src/routes/b.$slug.tsx` como wizard de 3 pasos con estado local:

**Paso 1 — Sucursal**
- Lista visual de sucursales activas del negocio (nombre, dirección, horario resumido).
- Al hacer clic se avanza al paso 2.

**Paso 2 — Cómo reservar**
- Dos tarjetas grandes equivalentes: "Por Profesional" / "Por Servicio".
- **Rama Profesional**: lista profesionales de la sucursal → al elegir uno, muestra solo los servicios que ese profesional ofrece.
- **Rama Servicio**: lista servicios disponibles en la sucursal (servicios ofrecidos por al menos un profesional asignado a esa sucursal) → al elegir uno, muestra los profesionales que lo realizan en esa sucursal.
- Ambas ramas terminan con `{ location, professional, service }` definidos.

**Paso 3 — Fecha, hora y confirmación**
- Calendario para elegir día.
- Slots calculados a partir de:
  - Horario de la sucursal (`location_hours`) ∩ Reglas de disponibilidad del negocio (`availability_rules`) — usaremos el horario de la sucursal como fuente principal.
  - Citas existentes del **profesional** en esa sucursal (para no chocar).
  - Duración del servicio.
- Formulario final: nombre + WhatsApp (con `PhoneInput` de prefijo separado).
- Crea `client` + `appointment` (status `pending`, source `booking_page`) con `location_id` y `professional_id`.

UX móvil: 1 columna, pasos grandes, botón "Atrás" en cada paso, indicador de progreso (1/3, 2/3, 3/3).

---

## 4. Agenda

En `dashboard.agenda.tsx`, mostrar etiqueta de sucursal y profesional en cada cita. Filtro opcional por sucursal/profesional (nice-to-have, puedo dejarlo para después si quieres).

---

## Orden de implementación

1. Migración SQL (tablas + RLS + grants + columnas en `appointments`).
2. Página `dashboard.sucursales.tsx` con CRUD de sucursales y profesionales.
3. Rediseño completo de `b.$slug.tsx` (wizard 3 pasos).
4. Mostrar sucursal/profesional en agenda.

---

## Preguntas antes de empezar

1. **Profesionales con cuenta propia**: ¿los profesionales solo son "recursos" que el dueño gestiona, o más adelante cada uno tendrá su propio login? (Por ahora asumo lo primero — solo recursos. Si después quieres logins, se agrega `user_id` opcional.)
2. **Horario**: ¿cada sucursal tiene su propio horario independiente, o también heredan del horario general del negocio? (Asumo independiente — la sucursal manda.)
3. **Servicios**: ¿el precio/duración de un servicio es igual en todas las sucursales, o puede variar por sucursal/profesional? (Asumo igual — un servicio = un precio.)

Si las 3 asunciones te calzan, dime "dale" y arranco. Si quieres cambiar alguna, avísame.
