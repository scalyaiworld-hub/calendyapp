import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacidad")({
  component: PrivacidadPage,
  head: () => ({
    meta: [
      { title: "Política de privacidad — Calendya" },
      {
        name: "description",
        content:
          "Cómo Calendya recopila, usa y protege la información de los negocios y sus clientes.",
      },
      { property: "og:title", content: "Política de privacidad — Calendya" },
      {
        property: "og:description",
        content: "Prácticas de privacidad de Calendya.",
      },
      { property: "og:type", content: "article" },
    ],
  }),
});

function PrivacidadPage() {
  return (
    <main className="min-h-dvh bg-background text-foreground">
      <header className="border-b border-border px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link to="/" className="font-display text-lg font-semibold tracking-tight">
            Calendya
          </Link>
          <Link to="/terminos" className="text-sm text-muted-foreground hover:text-foreground">
            Términos
          </Link>
        </div>
      </header>

      <article className="max-w-3xl mx-auto px-6 py-12 space-y-8 text-sm leading-relaxed">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight mb-2">
            Política de privacidad
          </h1>
          <p className="text-muted-foreground">Última actualización: julio de 2026</p>
        </div>

        <p className="rounded-lg border border-border bg-muted/30 p-4 text-muted-foreground">
          Esta página la mantiene el equipo de Calendya para explicar cómo tratamos la información
          en la plataforma. No constituye una certificación independiente. Si tienes dudas,
          escríbenos al correo indicado al final.
        </p>

        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold">1. Quiénes somos</h2>
          <p>
            Calendya es una herramienta para que salones, spas y negocios de servicios gestionen
            citas, clientes y sucursales, con una página de reservas pública para sus propios
            clientes.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold">2. Qué información recopilamos</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <span className="font-medium">De los dueños del negocio:</span> correo electrónico y
              datos de acceso (para iniciar sesión), nombre del negocio, teléfono/WhatsApp,
              sucursales, servicios, horarios, profesionales y plan contratado.
            </li>
            <li>
              <span className="font-medium">De los clientes finales del negocio:</span> nombre,
              teléfono y país. Estos datos los introduce el propio cliente al reservar, o el dueño
              del negocio al registrarlo manualmente.
            </li>
            <li>
              <span className="font-medium">De las reservas:</span> servicio elegido, profesional,
              sucursal, fecha, hora y estado (pendiente, confirmada, completada, cancelada,
              no-show).
            </li>
            <li>
              <span className="font-medium">Datos técnicos:</span> registros mínimos del navegador
              (por ejemplo, errores) para mantener la plataforma estable.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold">3. Para qué usamos la información</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>Mostrarle al negocio su agenda, sus clientes y sus estadísticas.</li>
            <li>Permitir que los clientes finales reserven en la página pública del negocio.</li>
            <li>
              Aplicar los límites del plan contratado (por ejemplo, cantidad de citas al mes).
            </li>
            <li>
              Enviar mensajes de servicio (por ejemplo, confirmación o recordatorio, cuando el plan
              lo incluye).
            </li>
            <li>Mejorar la plataforma y prevenir abuso o fraude.</li>
          </ul>
          <p>
            No vendemos ni alquilamos información personal a terceros. No usamos los datos de los
            clientes de un negocio con fines publicitarios propios.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold">4. Quién ve qué</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <span className="font-medium">El dueño del negocio</span> ve sus propios clientes,
              reservas, sucursales y profesionales. No puede ver datos de otros negocios.
            </li>
            <li>
              <span className="font-medium">Los visitantes de la página de reservas</span> solo ven
              la información pública que el negocio decidió mostrar (nombre, servicios, horarios,
              sucursales activas, profesionales activos). No ven teléfonos ni datos de contacto
              internos.
            </li>
            <li>
              <span className="font-medium">El equipo de Calendya</span> accede a la información
              únicamente para operar el servicio (soporte, diagnóstico de errores, cumplimiento
              legal).
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold">5. Dónde se guarda</h2>
          <p>
            La información se aloja en la infraestructura administrada de Supabase (base de datos
            gestionada, almacenamiento privado y autenticación). Se aplican controles de acceso por
            fila para que cada negocio solo pueda leer su propia información.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold">6. Cuánto tiempo la guardamos</h2>
          <p>
            Mantenemos la información mientras la cuenta esté activa. Al eliminar un cliente, una
            sucursal, un profesional o un servicio, se marca como borrado y se oculta del uso
            diario. Si deseas eliminar por completo tu cuenta y todos los datos asociados,
            escríbenos.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold">7. Tus derechos</h2>
          <p>
            Puedes acceder, corregir o solicitar la eliminación de tu información en cualquier
            momento. Los clientes finales de un negocio deben ejercer estos derechos ante el propio
            negocio, que es responsable de sus datos.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold">8. Cookies</h2>
          <p>
            Solo usamos almacenamiento local necesario para mantener tu sesión iniciada. No usamos
            cookies de terceros con fines publicitarios.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold">9. Cambios en esta política</h2>
          <p>
            Podemos actualizar esta política cuando cambien las funciones del producto o la
            legislación aplicable. La versión vigente siempre estará publicada en esta página.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold">10. Contacto</h2>
          <p>
            Para consultas de privacidad, escríbenos a{" "}
            <a href="mailto:hola@calendya.app" className="underline">
              hola@calendya.app
            </a>
            .
          </p>
        </section>

        <div className="pt-6 border-t border-border text-xs text-muted-foreground">
          <Link to="/" className="hover:text-foreground">
            ← Volver al inicio
          </Link>
        </div>
      </article>
    </main>
  );
}
