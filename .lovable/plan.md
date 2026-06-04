# Plan de mejoras

Te propongo cinco bloques de cambios. Te explico cada uno simple y luego los detalles técnicos.

## 1. Login con Google + rediseño

**Qué cambia para el usuario:**
- Pantalla de ingreso más limpia: botón grande de Google arriba, separador "o continúa con email", y debajo el formulario de email + contraseña.
- Quien quiera puede entrar con su cuenta de Google en un clic.

**Detalles técnicos:**
- Habilitar el proveedor Google en el backend (`configure_social_auth providers: ["google"]`).
- Usar el broker de Lovable: `lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/dashboard" })`.
- Rediseño de `src/routes/auth.tsx` con mejor jerarquía (logo, título grande, botón Google con ícono, divisor, formulario).

## 2. Onboarding obligatorio en 3 pasos

**Qué cambia para el usuario:**
- En el primer ingreso aparece un asistente que no se puede saltar.
- Paso 1: WhatsApp (selector de país con bandera + código, y campo aparte para el número).
- Paso 2: Nombre del salón.
- Paso 3: Servicios (con botón "Omitir por ahora").
- Mientras no termine, cualquier ruta del dashboard lo devuelve al paso pendiente.

**Detalles técnicos:**
- Migración: agregar a `businesses` las columnas `whatsapp_country_code` (text, default '+51'), `whatsapp_number` (text), `onboarding_completed` (boolean, default false), `onboarding_step` (smallint, default 1).
- Nueva ruta `src/routes/_authenticated/onboarding.tsx` (o `src/routes/dashboard.onboarding.tsx`) con un stepper de 3 pasos.
- En `dashboard.tsx`, si `!business` o `!business.onboarding_completed`, redirigir a `/dashboard/onboarding`.
- Componente `PhoneInput` reutilizable: dropdown con países comunes de LatAm + España + EEUU (bandera emoji + código), input numérico aparte. Guarda `country_code` y `number` separados.
- El paso 3 reutiliza el `CatalogDialog` por rubro (ver bloque 5) y permite "Omitir por ahora" (marca `onboarding_completed = true` sin servicios).

## 3. Link público de reservas

**Qué cambia para el usuario:**
- En Agenda hay un botón "Copiar link de reservas". Al hacer clic, copia al portapapeles la URL pública del salón.
- Cualquier cliente final que abra ese link ve los servicios activos, elige uno, ve solo los huecos libres según horarios y citas existentes, y reserva.

**Detalles técnicos:**
- Botón en `src/routes/dashboard.agenda.tsx` que copia `${window.location.origin}/b/${business.slug}` con `navigator.clipboard.writeText` y `toast.success`.
- Mejorar `src/routes/b.$slug.tsx` para que tenga el flujo completo: selección de servicio → selección de fecha → mostrar slots disponibles calculados con `src/lib/availability.ts` (cruzando `availability_rules` con `appointments` no canceladas y duración del servicio) → formulario simple (nombre + WhatsApp con prefijo separado) → crear `client` (o reusar por teléfono) y `appointment` con status `pending`.
- Requiere policy pública (anon) de **INSERT** en `appointments` y `clients` solo cuando `business_id` corresponde a un negocio activo, y **SELECT** público sobre `businesses`, `services` activos y `availability_rules` por slug. Migración con grants + policies acotadas.

## 4. WhatsApp con prefijo separado en todos lados

**Qué cambia para el usuario:**
- Onboarding, ajustes del salón, alta de clientes y formulario público de reservas: siempre dos campos (prefijo país + número local). Nunca uno solo.

**Detalles técnicos:**
- Componente `src/components/PhoneInput.tsx` reutilizable (controlado, recibe `countryCode`, `number` y `onChange`).
- Lista de países en `src/lib/countries.ts` (~15 países LatAm + ES + US con bandera emoji + código).
- Migración: agregar a `clients` `phone_country_code` (text) y mantener `phone` como el número local. Conservar `phone` existente como número (sin migración destructiva).
- Actualizar `dashboard.ajustes.tsx`, `dashboard.clientes.tsx`, `dashboard.agenda.tsx` (NewApptDialog), `b.$slug.tsx` para usar `PhoneInput`.

## 5. Plantillas de servicios por rubro

**Qué cambia para el usuario:**
- Al crear el salón ya **no** se precargan servicios automáticamente.
- En Servicios aparece una galería con plantillas agrupadas por rubro: Peluquería, Barbería, Spa, Uñas, Estética.
- El usuario elige las que quiere, las importa con un clic, y puede editar nombre / duración / precio. También puede crear servicios desde cero (ya existe).

**Detalles técnicos:**
- Reemplazar `src/lib/spa-catalog.ts` por `src/lib/service-templates.ts` con cinco rubros y ~10–15 servicios cada uno.
- Quitar la pre-carga automática en `dashboard.index.tsx` (`Onboarding`) y del paso 3 del nuevo onboarding (cargar solo lo que el usuario seleccione).
- Rediseñar `CatalogDialog` en `dashboard.servicios.tsx`: tabs por rubro, tarjetas seleccionables, contador de seleccionados, botón "Importar N servicios".

## Orden de implementación

1. Migración: columnas de onboarding, columnas de WhatsApp en clients, policies públicas para reservas anon.
2. Habilitar Google OAuth + rediseño de `/auth`.
3. `PhoneInput` + `countries.ts`.
4. Service templates (5 rubros) + rediseño de `CatalogDialog`.
5. Onboarding stepper obligatorio + gate en `dashboard.tsx`.
6. Botón "Copiar link" en Agenda + flujo público completo en `/b/$slug`.
7. Reemplazar todos los inputs de teléfono por `PhoneInput`.

## Preguntas antes de implementar

- ¿El link público de reservas debe crear la cita como **pendiente** (tú la confirmas desde Agenda) o **confirmada** automáticamente?
- Para el selector de país, ¿con LatAm + España + EEUU es suficiente o quieres lista mundial completa?
