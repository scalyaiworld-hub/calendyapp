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
    <div className="min-h-screen">
      <Header />
      <Hero />
      <Problem />
      <Features />
      <HowItWorks />
      <Pricing />
      <Footer />
    </div>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-50 backdrop-blur-md bg-background/70 border-b border-border/50">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-md gradient-rose grid place-items-center">
            <span className="font-display font-bold text-warm-dark text-lg">A</span>
          </div>
          <span className="font-display text-xl tracking-tight">AutoCitas</span>
        </div>
        <nav className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
          <a href="#features" className="hover:text-rose transition-colors">Funciones</a>
          <a href="#how" className="hover:text-rose transition-colors">Cómo funciona</a>
          <a href="#pricing" className="hover:text-rose transition-colors">Precios</a>
        </nav>
        <div className="flex items-center gap-3">
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">Ingresar</Link>
          <Link
            to="/"
            className="px-4 py-2 rounded-md bg-rose text-warm-dark text-sm font-medium hover:opacity-90 transition"
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
      <div className="max-w-6xl mx-auto px-6 pt-24 pb-32 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-rose/30 bg-rose/5 mb-8">
          <span className="size-1.5 rounded-full bg-rose animate-pulse" />
          <span className="text-xs uppercase tracking-widest text-rose-soft">Para salones, spas y estéticas</span>
        </div>
        <h1 className="font-display text-5xl md:text-7xl lg:text-8xl leading-[0.95] mb-8">
          Tu salón
          <br />
          <span className="gradient-rose-text italic">agenda sola.</span>
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-12 leading-relaxed">
          Convierte mensajes y clicks en citas confirmadas — sin cuaderno, sin perder
          clientes, sin responder a cada hora.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4">
          <Link
            to="/"
            className="px-8 py-4 rounded-md gradient-rose text-warm-dark font-semibold shadow-rose hover:scale-[1.02] transition"
          >
            Empieza gratis
          </Link>
          <a href="#how" className="px-8 py-4 rounded-md border border-border hover:border-rose/50 transition">
            Ver cómo funciona
          </a>
        </div>
        <p className="mt-8 text-xs uppercase tracking-widest text-muted-foreground">
          Sin tarjeta · Configúralo en 10 minutos
        </p>
      </div>
      <div className="divider-rose max-w-3xl mx-auto" />
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
        <p className="text-xs uppercase tracking-widest text-rose mb-4">El problema</p>
        <h2 className="font-display text-4xl md:text-5xl mb-16 max-w-2xl">
          Hoy gestionas tu salón como en los 90.
        </h2>
        <div className="grid md:grid-cols-3 gap-8">
          {items.map((i) => (
            <div key={i.n} className="surface-elev rounded-lg p-8">
              <div className="font-mono text-sm text-rose mb-4">{i.n}</div>
              <h3 className="font-display text-2xl mb-3">{i.t}</h3>
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
    { t: "Chat con IA", d: "Tu cliente escribe \"manicure mañana 4pm\" y se agenda solo." },
    { t: "Clientes guardados", d: "Cada cliente con su historial. Sin libreta, sin Excel." },
    { t: "Métricas reales", d: "Cuánto vendiste hoy, este mes, qué servicio prefieren." },
    { t: "Cero fricción", d: "Diseñado para estilistas, no para programadores." },
  ];
  return (
    <section id="features" className="py-24 px-6 border-t border-border/50">
      <div className="max-w-6xl mx-auto">
        <p className="text-xs uppercase tracking-widest text-rose mb-4">La solución</p>
        <h2 className="font-display text-4xl md:text-5xl mb-16 max-w-2xl">
          Todo lo que necesitas, <span className="gradient-rose-text italic">nada que no.</span>
        </h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-px bg-border rounded-lg overflow-hidden">
          {features.map((f) => (
            <div key={f.t} className="bg-card p-8 hover:bg-accent/30 transition">
              <div className="size-10 rounded-md bg-rose/10 border border-rose/30 grid place-items-center mb-5">
                <div className="size-2 rounded-full bg-rose" />
              </div>
              <h3 className="font-display text-xl mb-2">{f.t}</h3>
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
    <section id="how" className="py-24 px-6 border-t border-border/50">
      <div className="max-w-5xl mx-auto">
        <p className="text-xs uppercase tracking-widest text-rose mb-4">Cómo funciona</p>
        <h2 className="font-display text-4xl md:text-5xl mb-16">Tres pasos. Listo.</h2>
        <div className="space-y-px">
          {steps.map((s) => (
            <div key={s.n} className="surface-elev p-8 flex items-start gap-8 rounded-none first:rounded-t-lg last:rounded-b-lg">
              <div className="font-display text-5xl gradient-rose-text shrink-0 w-16">{s.n}</div>
              <div>
                <h3 className="font-display text-2xl mb-2">{s.t}</h3>
                <p className="text-muted-foreground">{s.d}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  return (
    <section id="pricing" className="py-24 px-6 border-t border-border/50">
      <div className="max-w-3xl mx-auto text-center">
        <p className="text-xs uppercase tracking-widest text-rose mb-4">Precio</p>
        <h2 className="font-display text-4xl md:text-5xl mb-12">Un precio. Sin sorpresas.</h2>
        <div className="surface-elev rounded-xl p-12 shadow-rose">
          <div className="font-display text-7xl mb-2">
            <span className="gradient-rose-text">$10</span>
            <span className="text-2xl text-muted-foreground"> / mes</span>
          </div>
          <p className="text-muted-foreground mb-8">Todo incluido. Cancela cuando quieras.</p>
          <ul className="text-left max-w-sm mx-auto space-y-3 mb-10 text-sm">
            {["Citas ilimitadas", "Link de reservas", "Chat con IA", "Clientes y métricas", "Soporte en español"].map((f) => (
              <li key={f} className="flex items-center gap-3">
                <span className="text-rose">✓</span> {f}
              </li>
            ))}
          </ul>
          <Link to="/" className="inline-block px-8 py-4 rounded-md gradient-rose text-warm-dark font-semibold hover:scale-[1.02] transition">
            Empezar ahora
          </Link>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border/50 py-12 px-6">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="size-6 rounded gradient-rose grid place-items-center">
            <span className="font-display font-bold text-warm-dark text-xs">A</span>
          </div>
          <span className="font-display">AutoCitas</span>
        </div>
        <p className="text-xs text-muted-foreground">© 2026 AutoCitas. Hecho en Perú.</p>
      </div>
    </footer>
  );
}
