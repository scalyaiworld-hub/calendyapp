import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AutoCitas — Tu salón agenda sola" },
      { name: "description", content: "Plataforma para salones, spas y estéticas que convierte mensajes y clicks en citas confirmadas automáticamente. Adiós cuaderno." },
      { property: "og:title", content: "AutoCitas — Tu salón agenda sola" },
      { property: "og:description", content: "Convierte mensajes en citas confirmadas. Sin cuaderno, sin perder clientes." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <Hero />
      <TrustStrip />
      <Problem />
      <Features />
      <HowItWorks />
      <Pricing />
      <FAQ />
      <CTA />
      <Footer />
    </div>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-50 backdrop-blur-xl bg-background/80 border-b border-border">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-md bg-primary grid place-items-center">
            <span className="font-display font-bold text-primary-foreground text-lg">A</span>
          </div>
          <span className="font-display text-xl font-semibold tracking-tight">AutoCitas</span>
        </div>
        <nav className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
          <a href="#features" className="hover:text-foreground transition-colors">Funciones</a>
          <a href="#how" className="hover:text-foreground transition-colors">Cómo funciona</a>
          <a href="#pricing" className="hover:text-foreground transition-colors">Precios</a>
          <a href="#faq" className="hover:text-foreground transition-colors">FAQ</a>
        </nav>
        <div className="flex items-center gap-3">
          <Link to="/auth" className="text-sm text-muted-foreground hover:text-foreground">Ingresar</Link>
          <Link
            to="/auth"
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition shadow-sm"
          >
            Empezar gratis
          </Link>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Soft background accents */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 60% 50% at 50% 0%, color-mix(in oklab, var(--primary) 14%, transparent), transparent 60%), radial-gradient(ellipse 40% 30% at 90% 20%, color-mix(in oklab, var(--primary) 10%, transparent), transparent 70%)",
        }}
      />
      <div className="max-w-6xl mx-auto px-6 pt-20 pb-28 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border bg-card mb-8 shadow-sm">
          <span className="size-1.5 rounded-full bg-primary animate-pulse" />
          <span className="text-xs uppercase tracking-widest text-muted-foreground">Para salones, spas y estéticas</span>
        </div>
        <h1 className="font-display text-5xl md:text-7xl lg:text-[5.5rem] leading-[1.02] tracking-tight mb-8 font-semibold">
          Tu negocio
          <br />
          <span className="text-primary">agenda solo.</span>
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
          Convierte mensajes y clicks en citas confirmadas — sin cuaderno, sin perder
          clientes, sin responder a cada hora.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/auth"
            className="px-8 py-4 rounded-lg bg-primary text-primary-foreground font-semibold shadow-rose hover:shadow-lg hover:-translate-y-0.5 transition"
          >
            Empieza gratis
          </Link>
          <a href="#how" className="px-8 py-4 rounded-lg border border-border bg-card hover:bg-accent transition">
            Ver cómo funciona
          </a>
        </div>
        <p className="mt-8 text-xs uppercase tracking-widest text-muted-foreground">
          Sin tarjeta · Configúralo en 10 minutos
        </p>
      </div>
    </section>
  );
}

function TrustStrip() {
  const stats = [
    { n: "+500", l: "Citas reservadas/día" },
    { n: "30s", l: "Reserva promedio" },
    { n: "0", l: "Doble bookings" },
    { n: "24/7", l: "Disponibilidad" },
  ];
  return (
    <section className="border-y border-border bg-card/50">
      <div className="max-w-6xl mx-auto px-6 py-8 grid grid-cols-2 md:grid-cols-4 gap-6">
        {stats.map((s) => (
          <div key={s.l} className="text-center">
            <div className="font-display text-3xl md:text-4xl font-semibold text-foreground">{s.n}</div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground mt-1">{s.l}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Problem() {
  const items = [
    { n: "01", t: "El cuaderno", d: "Pierdes citas, no sabes cuánto vendiste, y olvidas a los clientes." },
    { n: "02", t: "WhatsApp infinito", d: "Pasas el día respondiendo \"¿tienes hora?\" en vez de atendiendo." },
    { n: "03", t: "Horas vacías", d: "Tu agenda tiene huecos que no rellenas porque no los ves a tiempo." },
  ];
  return (
    <section className="py-24 px-6">
      <div className="max-w-5xl mx-auto">
        <p className="text-xs uppercase tracking-widest text-primary mb-4 font-medium">El problema</p>
        <h2 className="font-display text-4xl md:text-5xl mb-16 max-w-2xl font-semibold tracking-tight">
          Hoy gestionas tu negocio como en los 90.
        </h2>
        <div className="grid md:grid-cols-3 gap-8">
          {items.map((i) => (
            <div key={i.n} className="bg-card border border-border rounded-xl p-8 hover:border-primary/40 hover:shadow-sm transition">
              <div className="font-mono text-sm text-primary mb-4">{i.n}</div>
              <h3 className="font-display text-2xl mb-3 font-semibold">{i.t}</h3>
              <p className="text-muted-foreground leading-relaxed">{i.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Features() {
  const features = [
    { t: "Agenda inteligente", d: "Tu calendario se actualiza solo. Sin doble booking, jamás." },
    { t: "Link de reservas", d: "Comparte un link y tus clientes agendan en 30 segundos." },
    { t: "Multi-sucursal", d: "Gestiona varias sucursales y profesionales desde un solo lugar." },
    { t: "Clientes guardados", d: "Cada cliente con su historial. Sin libreta, sin Excel." },
    { t: "Marca personalizada", d: "Colores, tipografía y logo a tu medida en tu página pública." },
    { t: "Cero fricción", d: "Diseñado para dueños de negocio, no para programadores." },
  ];
  return (
    <section id="features" className="py-24 px-6 border-t border-border">
      <div className="max-w-6xl mx-auto">
        <p className="text-xs uppercase tracking-widest text-primary mb-4 font-medium">La solución</p>
        <h2 className="font-display text-4xl md:text-5xl mb-16 max-w-2xl font-semibold tracking-tight">
          Todo lo que necesitas, <span className="text-primary">nada que no.</span>
        </h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-px bg-border rounded-xl overflow-hidden border border-border">
          {features.map((f) => (
            <div key={f.t} className="bg-card p-8 hover:bg-accent/40 transition group">
              <div className="size-10 rounded-lg bg-primary/10 border border-primary/20 grid place-items-center mb-5 group-hover:bg-primary/15 transition">
                <div className="size-2 rounded-full bg-primary" />
              </div>
              <h3 className="font-display text-xl mb-2 font-semibold">{f.t}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{f.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { n: "1", t: "Configura tu salón", d: "Nombre, horario, servicios. 5 minutos." },
    { n: "2", t: "Comparte tu link", d: "Tus clientes reservan solos desde el teléfono." },
    { n: "3", t: "Atiende y cobra", d: "Tu agenda llena, sin levantar el teléfono." },
  ];
  return (
    <section id="how" className="py-24 px-6 border-t border-border">
      <div className="max-w-5xl mx-auto">
        <p className="text-xs uppercase tracking-widest text-primary mb-4 font-medium">Cómo funciona</p>
        <h2 className="font-display text-4xl md:text-5xl mb-16 font-semibold tracking-tight">Tres pasos. Listo.</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {steps.map((s) => (
            <div key={s.n} className="bg-card border border-border rounded-xl p-8 relative">
              <div className="font-display text-6xl text-primary/20 font-semibold absolute top-4 right-6">{s.n}</div>
              <h3 className="font-display text-2xl mb-2 font-semibold mt-6">{s.t}</h3>
              <p className="text-muted-foreground">{s.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  return (
    <section id="pricing" className="py-24 px-6 border-t border-border">
      <div className="max-w-3xl mx-auto text-center">
        <p className="text-xs uppercase tracking-widest text-primary mb-4 font-medium">Precio</p>
        <h2 className="font-display text-4xl md:text-5xl mb-12 font-semibold tracking-tight">Un precio. Sin sorpresas.</h2>
        <div className="bg-card border border-border rounded-2xl p-10 md:p-12 shadow-rose relative overflow-hidden">
          <div className="absolute top-4 right-4 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs uppercase tracking-widest text-primary font-medium">
            Plan único
          </div>
          <div className="font-display text-7xl md:text-8xl mb-2 font-semibold tracking-tight">
            <span className="text-foreground">$29</span>
            <span className="text-2xl text-muted-foreground font-normal"> USD / mes</span>
          </div>
          <p className="text-muted-foreground mb-8">Todo incluido. Cancela cuando quieras.</p>
          <ul className="text-left max-w-sm mx-auto space-y-3 mb-10 text-sm">
            {[
              "Citas ilimitadas",
              "Link de reservas público",
              "Multi-sucursal y profesionales",
              "Marca y colores personalizados",
              "Clientes y métricas",
              "Soporte en español",
            ].map((f) => (
              <li key={f} className="flex items-center gap-3">
                <span className="size-5 rounded-full bg-primary/10 text-primary grid place-items-center text-xs">✓</span>
                <span className="text-foreground">{f}</span>
              </li>
            ))}
          </ul>
          <Link to="/auth" className="inline-block px-8 py-4 rounded-lg bg-primary text-primary-foreground font-semibold hover:shadow-lg hover:-translate-y-0.5 transition">
            Empezar ahora
          </Link>
          <p className="mt-4 text-xs text-muted-foreground">Sin tarjeta para probar · Setup en minutos</p>
        </div>
      </div>
    </section>
  );
}

function FAQ() {
  const items = [
    { q: "¿Necesito tarjeta para empezar?", a: "No. Puedes crear tu cuenta y configurar todo gratis. Solo pagas cuando decides activar el plan." },
    { q: "¿Funciona para cualquier rubro?", a: "Sí. Está pensado para salones, spas, barberías, estéticas, masajes, podología, tatuajes y cualquier negocio que agende citas." },
    { q: "¿Puedo cancelar cuando quiera?", a: "Sí. Sin contratos ni permanencia. Cancelas con un click desde tu panel." },
    { q: "¿Mis clientes necesitan instalar algo?", a: "No. Solo abren tu link de reservas desde el navegador y agendan en 30 segundos." },
  ];
  return (
    <section id="faq" className="py-24 px-6 border-t border-border">
      <div className="max-w-3xl mx-auto">
        <p className="text-xs uppercase tracking-widest text-primary mb-4 font-medium text-center">Preguntas</p>
        <h2 className="font-display text-4xl md:text-5xl mb-12 font-semibold tracking-tight text-center">
          Lo que más nos preguntan.
        </h2>
        <div className="space-y-3">
          {items.map((i) => (
            <details
              key={i.q}
              className="group bg-card border border-border rounded-xl px-6 py-4 hover:border-primary/30 transition"
            >
              <summary className="cursor-pointer list-none flex items-center justify-between font-medium text-foreground">
                {i.q}
                <span className="size-6 rounded-full bg-primary/10 text-primary grid place-items-center text-sm group-open:rotate-45 transition-transform">
                  +
                </span>
              </summary>
              <p className="mt-3 text-muted-foreground text-sm leading-relaxed">{i.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section className="py-24 px-6 border-t border-border">
      <div className="max-w-4xl mx-auto">
        <div
          className="relative overflow-hidden rounded-2xl p-12 md:p-16 text-center"
          style={{
            background:
              "linear-gradient(135deg, color-mix(in oklab, var(--primary) 95%, white), color-mix(in oklab, var(--primary) 75%, black))",
          }}
        >
          <h2 className="font-display text-4xl md:text-5xl text-primary-foreground font-semibold tracking-tight mb-4">
            Empieza hoy. Cobra mañana.
          </h2>
          <p className="text-primary-foreground/90 mb-8 max-w-xl mx-auto">
            Configura tu agenda en 10 minutos y comparte tu link de reservas con tus clientes.
          </p>
          <Link
            to="/auth"
            className="inline-block px-8 py-4 rounded-lg bg-background text-foreground font-semibold hover:-translate-y-0.5 transition shadow-lg"
          >
            Crear mi cuenta gratis
          </Link>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border py-12 px-6">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="size-6 rounded bg-primary grid place-items-center">
            <span className="font-display font-bold text-primary-foreground text-xs">A</span>
          </div>
          <span className="font-display font-semibold">AutoCitas</span>
        </div>
        <p className="text-xs text-muted-foreground">© 2026 AutoCitas. Hecho en Perú.</p>
      </div>
    </footer>
  );
}
