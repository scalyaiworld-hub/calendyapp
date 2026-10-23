# Calendya

Aplicación de reservas en línea al estilo Calendly, pensada para negocios de servicios (salones, consultorios, estudios). Cada negocio tiene una página pública de reservas (`/b/:slug`), un dashboard para gestionar citas, clientes, servicios, profesionales y sucursales, y un panel de administración de plataforma (`/admin`).

## Contenido

- [Funcionalidades](#funcionalidades)
- [Stack](#stack)
- [Requisitos](#requisitos)
- [Instalación](#instalación)
- [Variables de entorno](#variables-de-entorno)
- [Scripts](#scripts)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Rutas](#rutas)
- [Autenticación y roles](#autenticación-y-roles)
- [Base de datos y migraciones](#base-de-datos-y-migraciones)
- [Sincronización con Google Calendar](#sincronización-con-google-calendar)
- [Notas de seguridad (RLS)](#notas-de-seguridad-rls)
- [Despliegue](#despliegue)

## Funcionalidades

- Landing page pública con preregistro a planes de pago.
- Registro e inicio de sesión con email y contraseña, y con Google (OAuth). Recuperación de contraseña.
- Onboarding para crear el negocio (nombre, link público, zona horaria, marca).
- Página pública de reserva por negocio (`/b/:slug`), validada en el servidor.
- Dashboard: agenda, citas, clientes, servicios, profesionales, sucursales, horarios, planes y ajustes.
- Planes `free`, `pro` y `studio` con límites aplicados en base de datos.
- Panel `/admin` para ver negocios, cambiar planes y revisar solicitudes de preregistro.
- Integraciones (plan Studio): sincronización de citas con Google Calendar, feed ICS, API de lectura y webhooks.

## Stack

| Capa               | Tecnología                                                                                                |
| ------------------ | --------------------------------------------------------------------------------------------------------- |
| Framework          | [TanStack Start](https://tanstack.com/start) (React 19, SSR) con enrutado por archivos de TanStack Router |
| Lenguaje           | TypeScript                                                                                                |
| Estilos / UI       | Tailwind CSS 4, shadcn/ui (Radix UI), framer-motion, lucide-react                                         |
| Datos en cliente   | TanStack Query, react-hook-form, zod                                                                      |
| Backend            | Supabase (Postgres, Auth, RLS) y server functions de TanStack Start                                       |
| Build              | Vite 7 con el plugin de TanStack Start y Nitro (destino por defecto: Cloudflare)                          |
| Pruebas / calidad  | Vitest, Testing Library, ESLint, Prettier                                                                 |
| Gestor de paquetes | npm (`package-lock.json`)                                                                                 |

## Requisitos

- [Bun](https://bun.sh) (o Node.js 20+ con npm; el lockfile oficial es `bun.lock`).
- Un proyecto de Supabase.
- Opcional: [Supabase CLI](https://supabase.com/docs/guides/local-development) para trabajar con migraciones.

## Instalación

```bash
git clone <url-del-repositorio>
cd calendyapp
bun install
cp .env.example .env   # en PowerShell: Copy-Item .env.example .env
# Completa .env con los datos de tu proyecto de Supabase
bun run dev
```

La app queda disponible en la URL que imprime Vite (normalmente `http://localhost:5173`).

Después de crear el proyecto de Supabase:

1. Aplica las migraciones de `supabase/migrations/` (ver [Base de datos y migraciones](#base-de-datos-y-migraciones)).
2. En Supabase, habilita el proveedor **Google** en Authentication si quieres el inicio de sesión con Google, y agrega la URL de tu app a las _Redirect URLs_.

## Variables de entorno

Copia `.env.example` a `.env`. El archivo `.env` está en `.gitignore`; no lo subas al repositorio.

| Variable                        | Ámbito                     | Descripción                                                                                                                                             |
| ------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`             | Cliente y servidor         | URL del proyecto Supabase.                                                                                                                              |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Cliente y servidor         | Clave publishable (anon). Es pública.                                                                                                                   |
| `VITE_SUPABASE_PROJECT_ID`      | Cliente y servidor         | ID del proyecto Supabase.                                                                                                                               |
| `SUPABASE_URL`                  | Servidor                   | URL del proyecto, usada por el cliente de servidor.                                                                                                     |
| `SUPABASE_PUBLISHABLE_KEY`      | Servidor                   | Clave publishable para el middleware de autenticación.                                                                                                  |
| `SUPABASE_PROJECT_ID`           | Servidor                   | ID del proyecto Supabase.                                                                                                                               |
| `SUPABASE_SERVICE_ROLE_KEY`     | **Solo servidor, secreta** | Clave con la que `src/integrations/supabase/client.server.ts` omite RLS. Se necesita para `/admin`, el cambio de plan y las reservas públicas.          |
| `VITE_TURNSTILE_SITE_KEY`       | Cliente                    | Clave pública de Cloudflare Turnstile para la página de reservas. Opcional: sin ella no se muestra captcha.                                             |
| `TURNSTILE_SECRET_KEY`          | **Solo servidor, secreta** | Verifica el captcha en `createPublicBooking`. Si no está definida, no se exige (recomendado definirla en producción).                                   |
| `BOOKING_IP_SALT`               | Solo servidor              | Sal para guardar con hash las IP del límite de intentos de reserva.                                                                                     |
| `RESEND_API_KEY`                | **Solo servidor, secreta** | Envía el correo "recibimos tu reserva" cuando el cliente deja su email. Sin ella (o sin `EMAIL_FROM`) no se envía nada y la reserva funciona igual.     |
| `EMAIL_FROM`                    | Solo servidor              | Remitente verificado en Resend, por ejemplo `Calendya <reservas@tu-dominio.com>`.                                                                       |
| `SITE_URL`                      | Solo servidor              | Base de los enlaces `/cita/:token` de los correos. Si falta, se usa el host de la petición.                                                             |
| `GOOGLE_OAUTH_CLIENT_ID`        | Solo servidor              | Cliente OAuth de Google Cloud para la sincronización con Google Calendar. Sin las tres variables `GOOGLE_*` la integración aparece como no configurada. |
| `GOOGLE_OAUTH_CLIENT_SECRET`    | **Solo servidor, secreta** | Secreto del cliente OAuth de Google.                                                                                                                    |
| `GOOGLE_TOKEN_ENC_KEY`          | **Solo servidor, secreta** | 32 bytes en base64 con los que se cifran los tokens de Google guardados en la base. Si cambia, hay que volver a conectar las cuentas.                   |

Reglas importantes:

- Las variables con prefijo `VITE_` se incluyen en el JavaScript del navegador. Nunca pongas secretos en ellas.
- `SUPABASE_SERVICE_ROLE_KEY` se configura únicamente como variable/secreto del hosting (o en tu `.env` local, que está ignorado por git). No la agregues a `.env.example`.
- En Cloudflare Workers las variables se leen en cada petición: usa `process.env` dentro de funciones, no a nivel de módulo (ver `src/lib/config.server.ts`).

## Scripts

| Comando             | Descripción                                       |
| ------------------- | ------------------------------------------------- |
| `bun run dev`       | Servidor de desarrollo de Vite.                   |
| `bun run build`     | Build de producción.                              |
| `bun run build:dev` | Build en modo desarrollo.                         |
| `bun run preview`   | Sirve localmente el build.                        |
| `bun run lint`      | Ejecuta ESLint.                                   |
| `bun run format`    | Formatea el código con Prettier.                  |
| `bun run test`      | Ejecuta las pruebas con Vitest (una sola pasada). |

## Estructura del proyecto

```text
calendyapp/
├── public/                     # Archivos estáticos (logo)
├── supabase/
│   ├── config.toml             # Configuración del proyecto Supabase
│   └── migrations/             # Esquema, RLS, límites de plan, roles
├── src/
│   ├── routes/                 # Rutas por archivo (ver src/routes/README.md)
│   │   ├── __root.tsx          # Layout raíz
│   │   ├── index.tsx           # Landing page
│   │   ├── auth.tsx            # Login / registro / Google
│   │   ├── onboarding.tsx
│   │   ├── admin.tsx           # Panel de administración
│   │   ├── b.$slug.tsx         # Página pública de reservas
│   │   └── dashboard.*.tsx     # Secciones del dashboard
│   ├── components/             # Componentes propios y shadcn/ui (components/ui)
│   ├── hooks/
│   ├── integrations/
│   │   └── supabase/           # Clientes (browser y server) y middleware de auth
│   ├── lib/
│   │   ├── api/                # Server functions (*.functions.ts)
│   │   ├── auth-context.tsx    # Contexto de sesión
│   │   ├── availability.ts     # Cálculo de disponibilidad
│   │   └── ...                 # Utilidades (marca, países, límites, etc.)
│   ├── router.tsx
│   ├── server.ts               # Entrada de servidor (envoltorio de errores SSR)
│   └── routeTree.gen.ts        # Autogenerado; no editar
├── .env.example
└── vite.config.ts
```

Server functions principales (`src/lib/api/`):

| Archivo                       | Propósito                                                           |
| ----------------------------- | ------------------------------------------------------------------- |
| `admin.functions.ts`          | Estado de admin, resumen de negocios/preregistros y cambio de plan. |
| `plan.functions.ts`           | Bajar un negocio al plan Free (única transición que hace el dueño). |
| `public-booking.functions.ts` | Creación de reservas públicas con validaciones en servidor.         |
| `limits.functions.ts`         | Consulta de límites según el plan.                                  |

## Rutas

| Ruta                       | Acceso                                  |
| -------------------------- | --------------------------------------- |
| `/`                        | Pública (landing)                       |
| `/auth`, `/reset-password` | Pública                                 |
| `/b/:slug`                 | Pública (reserva de un negocio)         |
| `/privacidad`, `/terminos` | Pública                                 |
| `/onboarding`              | Usuario autenticado                     |
| `/dashboard/*`             | Usuario autenticado (dueño del negocio) |
| `/admin`                   | Solo rol `admin` (`noindex, nofollow`)  |

## Autenticación y roles

**Inicio de sesión.** Supabase Auth con email/contraseña y Google (`supabase.auth.signInWithOAuth`). Tras iniciar sesión, la app redirige a `/dashboard`. La sesión se expone con `AuthProvider` en `src/lib/auth-context.tsx`.

**Dueño de negocio.** Cada negocio tiene un `owner_id`. Las políticas RLS permiten al dueño leer y modificar solo sus propios datos.

**Administrador de plataforma.** El rol `admin` vive en la tabla `public.user_roles` (enum `app_role`):

- Nadie puede crear ni modificar roles desde el cliente. Un usuario solo puede leer sus propios roles; los roles se otorgan con SQL (SQL Editor o `service_role`).
- La función `public.has_role(user_id, role)` solo se puede ejecutar con `service_role`.
- La autorización se hace **en el servidor**. Cada server function de `src/lib/api/admin.functions.ts` pasa por `requireSupabaseAuth` y luego comprueba el rol en `user_roles`; sin rol rechaza con "Acceso denegado". La pantalla `/admin` solo oculta la interfaz: no es una barrera de seguridad por sí sola.

### Otorgar el rol admin

La migración `20261001130000_admin_roles.sql` crea el rol y asigna el primer admin con un email fijo dentro del propio SQL. Antes de aplicarla, **cambia ese email por el tuyo**. Para otorgar el rol a otra cuenta (que ya haya iniciado sesión al menos una vez), ejecuta en el SQL Editor de Supabase:

```sql
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role
FROM auth.users
WHERE lower(email) = 'correo@ejemplo.com'
ON CONFLICT DO NOTHING;
```

Para revocarlo:

```sql
DELETE FROM public.user_roles
WHERE role = 'admin'
  AND user_id = (SELECT id FROM auth.users WHERE lower(email) = 'correo@ejemplo.com');
```

### Planes

Los planes son `free`, `pro` y `studio`. Los límites (citas, sucursales, profesionales) se aplican con triggers en la base de datos, no solo en pantalla. El dueño no puede escribir la columna `plan`:

- Puede bajar a Free (`downgradeToFreePlan`).
- Los planes de pago los cambia un admin desde `/admin` (`setBusinessPlan`).

## Base de datos y migraciones

Las migraciones están en `supabase/migrations/` y se aplican en orden cronológico por nombre de archivo.

```bash
supabase link --project-ref <tu-project-ref>
supabase db push
```

Las dos migraciones más recientes cambian permisos y políticas de producción y están marcadas "NO aplicar sin revisar":

- `20261001120000_security_hardening.sql`: endurece grants y RLS.
- `20261001130000_admin_roles.sql`: crea `user_roles`, `has_role` y el primer admin.

Revísalas y pruébalas en un entorno de staging antes de aplicarlas en producción.

## Sincronización con Google Calendar

Cada cita que se crea, cambia o cancela aparece como evento en el Google Calendar del negocio (solo en ese sentido: Calendya → Google). El dueño conecta su cuenta en _Integraciones_, elige un calendario de destino y, si quiere, uno distinto por profesional. Diseño completo en `docs/superpowers/specs/2026-10-23-google-calendar-sync-design.md`.

Cómo funciona: un trigger en `appointments` encola el cambio en `google_calendar_jobs` y el cron llama cada minuto a `POST /api/public/sync-google-calendar`, que lo envía a la API de Google con reintentos. Los tokens se guardan cifrados (AES-GCM) en tablas solo de servidor.

Puesta en marcha:

1. En [Google Cloud Console](https://console.cloud.google.com/): habilita **Google Calendar API**, configura la pantalla de consentimiento con los scopes `.../auth/calendar.events` y `.../auth/calendar.calendarlist.readonly`, y crea un cliente OAuth de tipo _Aplicación web_ con la URI de redirección `https://TU-DOMINIO/api/google-calendar/callback` (en local, `http://localhost:8080/api/google-calendar/callback` con `SITE_URL=http://localhost:8080`).
2. Define `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` y `GOOGLE_TOKEN_ENC_KEY`. Para generar la clave: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. También hace falta `SITE_URL` (o que el host de la petición sea el dominio público), porque con él se arma la URI de redirección.
3. Aplica `supabase/migrations/20261023100000_google_calendar_sync.sql` y programa el cron que aparece comentado al final (usa el mismo `REMINDERS_CRON_SECRET` que los recordatorios y los webhooks).
4. Mientras la app no pase la verificación de Google, solo pueden conectar los _usuarios de prueba_ añadidos en la pantalla de consentimiento (máximo 100). `calendar.events` es un scope sensible: para abrirlo a todos los clientes hay que solicitar la verificación (requiere política de privacidad y dominio verificado, y puede tardar semanas).

## Notas de seguridad (RLS)

Todas las tablas de negocio tienen Row Level Security habilitado. Resumen del modelo tras el hardening de 2026-10-01:

- **`businesses`**: el dueño solo puede insertar y actualizar columnas concretas (grants por columna). No puede escribir `plan`, `id`, `created_at` ni cambiar `owner_id` al actualizar. `anon` solo lee negocios no eliminados; `authenticated` solo lee los suyos.
- **Lectura pública (`anon`)**: únicamente sucursales y profesionales activos y no eliminados, y las citas en estado `pending`, `booked` o `completed` (para calcular disponibilidad). Los usuarios autenticados ya no pueden leer los datos de todos los negocios.
- **Reservas públicas**: `anon` ya no inserta en `appointments` ni en `clients`. Las reservas pasan por `createPublicBooking` en el servidor con `service_role`, que valida horario, antelación y choques de citas. Los dueños crean citas con sus propias políticas.
- **`is_slug_available`**: función `SECURITY DEFINER` para comprobar si un link está libre sin poder leer negocios ajenos.
- **`audit_log`**: solo lectura desde el cliente (sin `UPDATE`/`DELETE`).
- **`user_roles`**: solo lectura de los propios roles; escritura únicamente con `service_role`.

Buenas prácticas al contribuir:

- Nunca expongas `SUPABASE_SERVICE_ROLE_KEY` al navegador ni uses `client.server.ts` desde código de cliente. El sufijo `.server.ts` evita que Vite lo incluya en el bundle.
- Usa `supabaseAdmin` (que omite RLS) solo en server functions y después de verificar la identidad y los permisos del usuario.
- Cada tabla nueva debe activar RLS y definir políticas explícitas; concede a `authenticated` y `anon` únicamente los permisos necesarios.
- Las funciones `SECURITY DEFINER` deben fijar `search_path` y revocar `EXECUTE` a los roles que no lo necesiten.
- No expongas mensajes de Postgres al usuario final; usa `src/lib/api/error-messages.ts`.
- Si encuentras una vulnerabilidad, repórtala de forma privada al equipo y no abras un issue público.

## Despliegue

El build usa Nitro con Cloudflare como destino por defecto (`bun run build`). Configura en el hosting las variables de la sección [Variables de entorno](#variables-de-entorno), incluida `SUPABASE_SERVICE_ROLE_KEY` como secreto, y agrega la URL de producción a las _Redirect URLs_ de Supabase Auth para que funcionen Google OAuth y la recuperación de contraseña.

## Licencia

Sin licencia definida. Agrega un archivo `LICENSE` si el proyecto se va a distribuir.
