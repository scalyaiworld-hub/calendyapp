## Alcance

Construir el sistema completo de citas para el dueño del salón/spa + un catálogo precargado de servicios típicos de spa que pueden agregar con un click.

## 1. Onboarding del negocio

- Al entrar a `/dashboard` sin negocio creado → wizard de 1 paso: nombre, slug (auto-sugerido), teléfono, timezone (default `America/Lima`).
- Crea fila en `businesses` y horario por defecto en `availability_rules` (lun–sáb 9:00–19:00).
- Opción "Cargar catálogo sugerido de spa" → inserta los servicios precargados.

## 2. Catálogo precargado (Servicios sugeridos de spa)

Categorías y servicios típicos que se ofrecen con un click:

**Cabello**
- Corte mujer (45min) / Corte hombre (30min) / Corte niño (30min)
- Lavado + peinado (30min)
- Brushing / Planchado (45min)
- Tinte completo (120min) / Retoque de raíz (90min)
- Mechas / Balayage (180min)
- Tratamiento capilar / Botox capilar (60min)
- Alisado / Keratina (180min)

**Uñas**
- Manicure clásico (45min) / Manicure semipermanente (60min)
- Pedicure clásico (60min) / Pedicure spa (75min)
- Uñas acrílicas / gel (90min)
- Nail art (30min adicional)

**Estética facial**
- Limpieza facial profunda (60min)
- Hidratación / Anti-edad (60min)
- Microdermoabrasión (45min)
- Depilación facial con cera (20min)

**Cuerpo / Spa**
- Masaje relajante 60min / 90min
- Masaje descontracturante (60min)
- Drenaje linfático (60min)
- Exfoliación corporal (45min)
- Depilación con cera: piernas / axilas / bikini

**Pestañas y cejas**
- Diseño de cejas (20min)
- Tinte de cejas / pestañas (30min)
- Lifting de pestañas (60min)
- Extensiones de pestañas (120min)

Se muestran como tarjetas seleccionables → "Agregar al catálogo" inserta varios `services` de una vez con precio editable después.

## 3. Dashboard del dueño (rutas anidadas bajo `/dashboard`)

```
/dashboard               → resumen (citas de hoy, próximas, KPIs)
/dashboard/agenda        → calendario semanal con citas
/dashboard/servicios     → CRUD de servicios + botón "Catálogo sugerido"
/dashboard/clientes      → CRUD de clientes
/dashboard/horarios      → editar availability_rules por día
/dashboard/ajustes       → datos del negocio + link a página pública
```

### Agenda
- Vista semanal (7 días × franjas horarias) con citas como bloques de color.
- Click en bloque vacío → modal "Nueva cita" (cliente nuevo o existente, servicio, fecha/hora sugerida).
- Click en cita → ver / editar / cancelar / marcar como completada / no-show.
- Filtros por estado.

### Servicios
- Lista de servicios activos con precio, duración, toggle activo.
- Crear / editar / archivar (soft delete con `deleted_at`).
- Botón "Agregar del catálogo sugerido" → modal con las tarjetas de la sección 2.

### Clientes
- Búsqueda por nombre / teléfono.
- Historial de citas por cliente, total de citas, no-shows, última visita.

## 4. Página pública de reservas `/b/:slug`

- Renderiza nombre, logo, lista de servicios activos (precio + duración).
- Flujo: elegir servicio → elegir fecha → elegir slot (usa `getAvailableSlots`) → datos del cliente (nombre + teléfono) → confirmar.
- Inserta en `clients` (upsert por phone+business) y en `appointments` con `source = 'booking_page'`.
- Pantalla de confirmación con resumen.

## 5. Detalles técnicos

- Todas las rutas privadas envueltas en chequeo de auth (redirect a `/auth`).
- Reads en componentes con `useQuery`, mutaciones con `useMutation` + invalidate.
- Modales con shadcn `Dialog`. Calendario con shadcn `Calendar` para selección de fecha.
- Formato de precio: `price_cents` / 100 → moneda local del business (por ahora hardcode S/. para Perú).
- Soft delete: filtrar siempre por `deleted_at IS NULL`.
- El backend (tablas + RLS + constraint anti-doble-booking) ya está listo de migraciones previas.

## 6. Fuera de alcance (siguientes iteraciones)

- Chat IA con function calling.
- WhatsApp / notificaciones automáticas.
- Reportes y métricas avanzadas.
- Pagos online.
- Multi-staff (por ahora 1 negocio = 1 calendario).

## Orden de implementación

1. Onboarding + catálogo sugerido + CRUD servicios
2. CRUD clientes
3. Editor de horarios
4. Agenda (vista + crear/editar cita)
5. Página pública de reservas
6. Dashboard resumen
