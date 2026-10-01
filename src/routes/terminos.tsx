import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/terminos")({
  component: TerminosPage,
  head: () => ({
    meta: [
      { title: "Términos de servicio — Calendya" },
      {
        name: "description",
        content: "Condiciones de uso de Calendya para negocios y sus clientes.",
      },
      { property: "og:title", content: "Términos de servicio — Calendya" },
      {
        property: "og:description",
        content: "Reglas de uso de la plataforma Calendya.",
      },
      { property: "og:type", content: "article" },
    ],
  }),
});

function TerminosPage() {
  return (
    <main className="min-h-dvh bg-background text-foreground">
      <header className="border-b border-border px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link to="/" className="font-display text-lg font-semibold tracking-tight">
            Calendya
          </Link>
          <Link to="/privacidad" className="text-sm text-muted-foreground hover:text-foreground">
            Privacidad
          </Link>
        </div>
      </header>

      <article className="max-w-3xl mx-auto px-6 py-12 space-y-8 text-sm leading-relaxed">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight mb-2">
            Términos de servicio
          </h1>
          <p className="text-muted-foreground">Última actualización: julio de 2026</p>
        </div>

        <p className="rounded-lg border border-border bg-muted/30 p-4 text-muted-foreground">
          Al crear una cuenta o usar Calendya aceptas estos términos. Si no estás de acuerdo, no
          uses el servicio.
        </p>

        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold">1. El servicio</h2>
          <p>
            Calendya es una plataforma en línea para gestionar reservas, clientes, profesionales y
            sucursales de negocios de servicios, con una página pública de reservas para cada
            negocio.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold">2. Cuenta</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>Eres responsable de la información de tu cuenta y de mantenerla segura.</li>
            <li>Debes usar datos reales de tu negocio.</li>
            <li>
              Una cuenta representa a un solo negocio. Si tienes varios, crea cuentas separadas.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold">3. Uso aceptable</h2>
          <p>No puedes usar Calendya para:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li>Actividades ilegales o que dañen a terceros.</li>
            <li>Enviar spam o mensajes no solicitados a clientes finales.</li>
            <li>Cargar contenido ofensivo, engañoso o que infrinja derechos de otros.</li>
            <li>
              Intentar acceder a datos de otros negocios o vulnerar la seguridad de la plataforma.
            </li>
            <li>Automatizar el uso del servicio con bots o scripts que abusen de los límites.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold">4. Planes y pagos</h2>
          <p>
            Calendya ofrece un plan gratuito con límites (por ejemplo, cantidad máxima de citas al
            mes, de sucursales o de profesionales) y planes pagados con límites mayores. Los
            detalles y precios están en la página de{" "}
            <Link to="/dashboard/planes" className="underline">
              planes
            </Link>
            . Podemos ajustar los precios avisando por adelantado.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold">
            5. Datos del negocio y de sus clientes
          </h2>
          <p>
            La información que subes al servicio sigue siendo tuya. Nos autorizas a procesarla
            únicamente para prestarte el servicio. Como responsable del negocio, tú determinas qué
            datos de tus clientes recoges y para qué. Debes cumplir con la legislación de protección
            de datos que se aplique en tu país.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold">6. Disponibilidad del servicio</h2>
          <p>
            Trabajamos para que Calendya esté siempre disponible, pero no garantizamos que funcione
            sin interrupciones. Podemos realizar mantenimiento o cambios sin previo aviso cuando sea
            necesario.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold">7. Cancelación</h2>
          <p>
            Puedes dejar de usar el servicio en cualquier momento. Podemos suspender o cerrar
            cuentas que incumplan estos términos, den un uso abusivo o representen un riesgo para
            otros usuarios.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold">8. Limitación de responsabilidad</h2>
          <p>
            En la medida permitida por la ley, Calendya no se hace responsable de daños indirectos,
            pérdida de beneficios ni pérdida de datos derivados del uso del servicio. La
            responsabilidad total, cuando corresponda, se limita al importe pagado en los últimos 12
            meses.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold">9. Cambios en los términos</h2>
          <p>
            Podemos actualizar estos términos cuando lo consideremos necesario. Publicaremos siempre
            la versión vigente en esta página.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold">10. Contacto</h2>
          <p>
            ¿Consultas sobre estos términos? Escríbenos a{" "}
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
