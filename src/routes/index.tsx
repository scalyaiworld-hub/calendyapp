import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  ArrowRight,
  Calendar,
  Link2,
  Building2,
  Users,
  Palette,
  Sparkles,
  Check,
  Plus,
  ShieldCheck,
  Clock,
  MessageCircle,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Calendya — Tu negocio agenda sola" },
      { name: "description", content: "Plataforma para negocios que convierte mensajes y clicks en citas confirmadas automáticamente. Adiós cuaderno." },
      { property: "og:title", content: "Calendya — Tu negocio agenda sola" },
      { property: "og:description", content: "Convierte mensajes en citas confirmadas. Sin cuaderno, sin perder clientes." },
    ],
  }),
  component: Index,
});

function Index() {
  const [proOpen, setProOpen] = useState(false);
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <Hero />
      <TrustStrip />
      <Problem />
      <SolutionTeaser />
      <Features />
      <HowItWorks />
      <Pricing onProClick={() => setProOpen(true)} />
      <FAQ />
      <CTA />
      <Footer />
      <ProPreregisterDialog open={proOpen} onOpenChange={setProOpen} />
    </div>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-50 backdrop-blur-xl bg-background/75 border-b border-border/60">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <img src="/logo.png" alt="Calendya" className="size-8 rounded-lg" />
          <span className="font-display text-lg font-semibold tracking-tight">Calendya</span>
        </div>
        <nav className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
          <a href="#features" className="hover:text-foreground transition-colors">Funciones</a>
          <a href="#how" className="hover:text-foreground transition-colors">Cómo funciona</a>
          <a href="#pricing" className="hover:text-foreground transition-colors">Precios</a>
          <a href="#faq" className="hover:text-foreground transition-colors">FAQ</a>
        </nav>
        <div className="flex items-center gap-3">
          <Link to="/auth" className="text-sm text-muted-foreground hover:text-foreground hidden sm:inline">Ingresar</Link>
          <Link
            to="/auth"
            className="group inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition shadow-soft"
          >
            Empezar gratis
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div aria-hidden className="absolute inset-0 -z-10 bg-grid opacity-60" />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 50% 40% at 50% 10%, color-mix(in oklab, var(--primary) 10%, transparent), transparent 70%)",
        }}
      />
      <div className="max-w-5xl mx-auto px-6 pt-20 md:pt-28 pb-20 md:pb-28 text-center">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-rose-50 border border-rose-100 mb-10">
          <span className="relative flex size-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75 animate-ping" />
            <span className="relative inline-flex rounded-full size-2 bg-rose-500" />
          </span>
          <span className="text-[11px] uppercase tracking-[0.18em] text-rose-600 font-semibold">Agenda inteligente para salones</span>
        </div>
        <h1 className="font-display text-[2.75rem] sm:text-6xl md:text-7xl lg:text-[6.5rem] leading-[0.9] tracking-[-0.035em] mb-8 font-bold">
          Tu salón merece{" "}
          <span className="text-primary italic font-normal">libertad</span>,
          <br className="hidden sm:block" />
          {" "}no un cuaderno.
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed font-light">
          Digitaliza tus reservas 24/7 y recupera 10 horas semanales de gestión manual. Deja que Calendya atienda el WhatsApp por ti.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/auth"
            className="group inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-primary text-primary-foreground font-semibold text-base hover:bg-primary/90 hover:-translate-y-0.5 transition shadow-xl shadow-primary/20"
          >
            Comenzar prueba gratis
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <a href="#how" className="px-8 py-4 rounded-2xl border border-border bg-card/80 backdrop-blur hover:bg-accent transition font-semibold text-base text-muted-foreground hover:text-foreground">
            Ver cómo funciona
          </a>
        </div>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><Check className="size-3.5 text-primary" /> Sin tarjeta</span>
          <span className="inline-flex items-center gap-1.5"><Check className="size-3.5 text-primary" /> 10 minutos</span>
          <span className="inline-flex items-center gap-1.5"><Check className="size-3.5 text-primary" /> Cancela cuando quieras</span>
        </div>
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
    <section className="border-y border-border/60">
      <div className="max-w-6xl mx-auto px-6 py-12 grid grid-cols-2 md:grid-cols-4 gap-y-8">
        {stats.map((s) => (
          <div key={s.l} className="text-center space-y-1.5">
            <div className="font-display text-4xl md:text-5xl font-bold text-primary tracking-tight">{s.n}</div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-medium">{s.l}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Problem() {
  const items = [
    {
      t: "Caos en WhatsApp",
      q: "\u201c\u00bfTienes hueco el jueves?\u201d",
      d: "Pierdes minutos respondiendo mensajes en vez de atender a tu cliente en silla.",
      accent: false,
    },
    {
      t: "Citas olvidadas",
      q: "\u201cSe me olvid\u00f3 por completo\u2026\u201d",
      d: "El cliente que no llega es pérdida directa. Sin recordatorios, se te va hasta el 20% de ingresos.",
      accent: true,
    },
    {
      t: "El cuaderno infinito",
      q: "\u201cB\u00fascame un hueco el 15\u2026\u201d",
      d: "Tachones, errores y cero datos. No sabes qui\u00e9n es tu mejor cliente y eso te frena.",
      accent: false,
    },
  ];
  return (
    <section className="py-24 md:py-32 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="max-w-2xl mb-16 md:mb-20 space-y-4">
          <SectionLabel>El problema</SectionLabel>
          <h2 className="font-display text-4xl md:text-6xl font-bold tracking-tight leading-[1.05]">
            El costo oculto de lo{" "}
            <span className="text-rose-500 italic font-normal">analógico</span>.
          </h2>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Gestionar un negocio exitoso con herramientas de ayer te quita tiempo y dinero hoy.
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {items.map((i) => (
            <div
              key={i.t}
              className={`p-8 rounded-[2rem] border transition-all duration-500 ${
                i.accent
                  ? "border-rose-100 bg-rose-50/40 hover:bg-card hover:shadow-2xl hover:shadow-rose-100 md:-translate-y-4"
                  : "border-border bg-card/60 hover:bg-card hover:shadow-2xl hover:shadow-primary/10"
              }`}
            >
              <div
                className={`size-12 mb-6 rounded-xl grid place-items-center ${
                  i.accent ? "bg-rose-100 text-rose-500" : "bg-primary/10 text-primary"
                }`}
              >
                {i.accent ? <Clock className="size-6" strokeWidth={1.75} /> : <MessageCircle className="size-6" strokeWidth={1.75} />}
              </div>
              <h3 className={`font-display text-2xl mb-4 font-bold tracking-tight ${i.accent ? "text-rose-950" : ""}`}>
                {i.t}
              </h3>
              <p className="text-muted-foreground italic leading-relaxed">{i.q}</p>
              <p className="text-muted-foreground leading-relaxed mt-2">{i.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SolutionTeaser() {
  return (
    <section className="px-6 pb-24 md:pb-32">
      <div className="max-w-6xl mx-auto">
        <div className="relative overflow-hidden rounded-[2.5rem] md:rounded-[3rem] bg-primary p-10 md:p-20">
          <div aria-hidden className="absolute -top-20 -right-20 size-72 rounded-full bg-white/10 blur-3xl" />
          <div aria-hidden className="absolute -bottom-20 -left-20 size-72 rounded-full bg-rose-400/25 blur-3xl" />
          <div className="relative z-10 flex flex-col md:flex-row gap-12 items-center">
            <div className="flex-1 space-y-6">
              <h2 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold text-primary-foreground leading-[1.05] tracking-tight">
                Diseñado para que vuelvas a{" "}
                <span className="italic font-normal underline decoration-rose-300 decoration-4 underline-offset-8">
                  amar
                </span>{" "}
                tu trabajo.
              </h2>
              <p className="text-primary-foreground/80 text-lg leading-relaxed max-w-lg">
                Calendya no es solo un software: es tu recepcionista estrella que nunca duerme, no comete errores y fideliza a tus clientes.
              </p>
              <div className="flex flex-wrap gap-3 pt-2">
                <Link
                  to="/auth"
                  className="group inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-background text-foreground font-semibold hover:-translate-y-0.5 transition shadow-lg"
                >
                  Probar gratis
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <a
                  href="#features"
                  className="inline-flex items-center px-6 py-3 rounded-xl border border-primary-foreground/20 bg-primary-foreground/5 text-primary-foreground font-semibold hover:bg-primary-foreground/10 transition"
                >
                  Ver funciones
                </a>
              </div>
            </div>
            <div className="flex-1 w-full">
              <div className="bg-white/10 backdrop-blur-md border border-white/20 p-3 rounded-3xl rotate-1 shadow-2xl">
                <div className="bg-background rounded-2xl aspect-[4/3] w-full p-5 flex flex-col gap-3">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="font-medium">Hoy · Martes 6</span>
                    <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-primary" />8 citas</span>
                  </div>
                  <div className="flex-1 space-y-2">
                    {[
                      { h: "09:00", n: "María López", s: "Corte + tinte", c: "bg-primary/10 border-primary/30 text-primary" },
                      { h: "10:30", n: "Sofía Torres", s: "Manicura", c: "bg-rose-100 border-rose-200 text-rose-700" },
                      { h: "12:00", n: "Ana Ríos", s: "Peinado novia", c: "bg-primary/10 border-primary/30 text-primary" },
                      { h: "14:00", n: "Lucía Vega", s: "Facial", c: "bg-muted border-border text-muted-foreground" },
                    ].map((a) => (
                      <div key={a.h} className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${a.c}`}>
                        <span className="font-mono text-xs tabular-nums">{a.h}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold truncate text-foreground">{a.n}</div>
                          <div className="text-[10px] truncate opacity-80">{a.s}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Features() {
  const features = [
    { i: Calendar, t: "Agenda inteligente", d: "Tu calendario se actualiza solo. Sin doble booking, jamás." },
    { i: Link2, t: "Link de reservas", d: "Comparte un link y tus clientes agendan en 30 segundos." },
    { i: Building2, t: "Multi-sucursal", d: "Gestiona varias sucursales y profesionales desde un solo lugar." },
    { i: Users, t: "Clientes guardados", d: "Cada cliente con su historial. Sin libreta, sin Excel." },
    { i: Palette, t: "Marca personalizada", d: "Colores, tipografía y logo a tu medida en tu página pública." },
    { i: Sparkles, t: "Cero fricción", d: "Diseñado para dueños de negocio, no para programadores." },
  ];
  return (
    <section id="features" className="py-24 px-6 border-t border-border">
      <div className="max-w-6xl mx-auto">
        <SectionLabel>La solución</SectionLabel>
        <h2 className="font-display text-4xl md:text-5xl mb-16 max-w-2xl font-semibold tracking-tight">
          Todo lo que necesitas, <span className="text-primary">nada que no.</span>
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-border rounded-2xl overflow-hidden border border-border shadow-soft">
          {features.map(({ i: Icon, t, d }) => (
            <div key={t} className="bg-card p-8 hover:bg-accent/30 transition group relative">
              <div className="size-11 rounded-xl bg-foreground/5 grid place-items-center mb-5 group-hover:bg-primary/10 group-hover:text-primary transition text-foreground/70">
                <Icon className="size-5" strokeWidth={1.5} />
              </div>
              <h3 className="font-display text-lg mb-2 font-semibold tracking-tight">{t}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{d}</p>
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
        <SectionLabel>Cómo funciona</SectionLabel>
        <h2 className="font-display text-4xl md:text-5xl mb-16 font-semibold tracking-tight">Tres pasos. Listo.</h2>
        <div className="grid md:grid-cols-3 gap-6 relative">
          {steps.map((s, idx) => (
            <div key={s.n} className="bg-card border border-border rounded-2xl p-8 relative overflow-hidden hover:shadow-soft transition">
              <div className="flex items-center justify-between mb-6">
                <div className="size-9 rounded-full bg-foreground text-background grid place-items-center font-display text-sm font-semibold">{s.n}</div>
                {idx < steps.length - 1 && <ArrowRight className="size-4 text-muted-foreground/40 hidden md:block" />}
              </div>
              <h3 className="font-display text-xl mb-2 font-semibold tracking-tight">{s.t}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{s.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Pricing({ onProClick }: { onProClick: () => void }) {
  const free = [
    "Hasta 50 citas/mes",
    "1 sucursal",
    "Link de reservas público",
    "Clientes y agenda básica",
  ];
  const pro = [
    "Citas ilimitadas",
    "Hasta 3 sucursales",
    "Profesionales ilimitados",
    "Recordatorios automáticos por WhatsApp y email",
    "Marca y colores personalizados",
    "Métricas avanzadas",
    "Soporte prioritario en español",
  ];
  const studio = [
    "Todo lo del plan Pro",
    "Chat con IA para tus clientes",
    "Sucursales y equipos ilimitados",
    "Roles y permisos por staff",
    "Integraciones (Google Calendar, Zapier, API)",
    "Reportes y exportes avanzados",
    "Onboarding 1:1 y soporte dedicado",
  ];
  return (
    <section id="pricing" className="py-24 px-6 border-t border-border">
      <div className="max-w-6xl mx-auto">
        <SectionLabel>Precio</SectionLabel>
        <h2 className="font-display text-4xl md:text-5xl mb-12 font-semibold tracking-tight">Empieza gratis. Crece cuando quieras.</h2>
        <div className="grid md:grid-cols-3 gap-5 items-stretch">
          {/* Free plan */}
          <PricingCard
            tier="Gratis"
            price="$0"
            period="/ mes"
            tagline="Para empezar y probar sin compromiso."
            features={free}
            cta={
              <Link to="/auth" className="mt-auto inline-block text-center px-6 py-3 rounded-lg border border-border bg-background hover:bg-accent font-medium transition">
                Crear cuenta gratis
              </Link>
            }
          />
          <PricingCard
            tier="Pro"
            price="$29"
            period="USD / mes"
            tagline="Para salones que ya están creciendo."
            features={pro}
            highlight
            cta={
              <button
                type="button"
                onClick={onProClick}
                className="group mt-auto inline-flex items-center justify-center gap-2 text-center px-6 py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition shadow-soft"
              >
                Preregistro <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </button>
            }
          />
          <PricingCard
            tier="Studio"
            price="$99"
            period="USD / mes"
            tagline="Para cadenas y equipos grandes."
            features={studio}
            dark
            cta={
              <button
                type="button"
                onClick={onProClick}
                className="mt-auto inline-block text-center px-6 py-3 rounded-lg bg-foreground text-background font-medium hover:bg-foreground/90 transition"
              >
                Hablar con ventas
              </button>
            }
          />
        </div>
        <p className="mt-8 text-xs text-muted-foreground text-center inline-flex items-center justify-center gap-2 w-full">
          <ShieldCheck className="size-3.5" /> Sin tarjeta para empezar · Cambia de plan cuando quieras
        </p>
      </div>
    </section>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/15">
      <span className="text-[11px] uppercase tracking-[0.2em] text-primary font-semibold">{children}</span>
    </div>
  );
}

function PricingCard({
  tier, price, period, tagline, features, cta, highlight, dark,
}: {
  tier: string; price: string; period: string; tagline: string;
  features: string[]; cta: React.ReactNode; highlight?: boolean; dark?: boolean;
}) {
  const base = "rounded-2xl p-8 flex flex-col relative transition";
  const variant = highlight
    ? "bg-card border-2 border-primary shadow-soft-lg md:-translate-y-2"
    : dark
      ? "bg-foreground text-background border border-foreground"
      : "bg-card border border-border hover:border-foreground/20";
  const labelColor = highlight ? "text-primary" : dark ? "text-background/60" : "text-muted-foreground";
  const taglineColor = dark ? "text-background/70" : "text-muted-foreground";
  const checkBg = highlight
    ? "bg-primary/10 text-primary"
    : dark
      ? "bg-background/10 text-background"
      : "bg-foreground/5 text-foreground";
  return (
    <div className={`${base} ${variant}`}>
      {highlight && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-primary text-primary-foreground text-[10px] uppercase tracking-[0.18em] font-semibold shadow-soft">
          Recomendado
        </div>
      )}
      <div className={`text-[11px] uppercase tracking-[0.22em] font-semibold mb-4 ${labelColor}`}>{tier}</div>
      <div className="font-display text-5xl mb-2 font-semibold tracking-tight flex items-baseline gap-1.5">
        <span>{price}</span>
        <span className={`text-sm font-normal ${taglineColor}`}>{period}</span>
      </div>
      <p className={`mb-8 text-sm ${taglineColor}`}>{tagline}</p>
      <ul className="text-left space-y-3 mb-10 text-sm">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-3">
            <span className={`mt-0.5 size-5 rounded-full grid place-items-center shrink-0 ${checkBg}`}>
              <Check className="size-3" strokeWidth={2.5} />
            </span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
      {cta}
    </div>
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
        <div className="flex justify-center"><SectionLabel>Preguntas</SectionLabel></div>
        <h2 className="font-display text-4xl md:text-5xl mb-12 font-semibold tracking-tight text-center">
          Lo que más nos preguntan.
        </h2>
        <div className="space-y-2">
          {items.map((i) => (
            <details
              key={i.q}
              className="group bg-card border border-border rounded-xl px-6 py-4 hover:border-foreground/20 transition open:shadow-soft"
            >
              <summary className="cursor-pointer list-none flex items-center justify-between font-medium text-foreground gap-4">
                {i.q}
                <span className="size-7 rounded-full bg-foreground/5 text-foreground/70 grid place-items-center group-open:rotate-45 group-open:bg-primary group-open:text-primary-foreground transition-all shrink-0">
                  <Plus className="size-3.5" strokeWidth={2.5} />
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
          className="relative overflow-hidden rounded-3xl p-12 md:p-20 text-center bg-foreground"
        >
          <div aria-hidden className="absolute inset-0 bg-dot opacity-30 pointer-events-none" />
          <div aria-hidden className="absolute -top-20 -right-20 size-72 rounded-full bg-primary/30 blur-3xl" />
          <h2 className="relative font-display text-4xl md:text-6xl text-background font-semibold tracking-[-0.03em] mb-5">
            Empieza hoy. Cobra mañana.
          </h2>
          <p className="relative text-background/70 mb-10 max-w-lg mx-auto">
            Configura tu agenda en 10 minutos y comparte tu link de reservas con tus clientes.
          </p>
          <Link
            to="/auth"
            className="relative group inline-flex items-center gap-2 px-8 py-4 rounded-lg bg-background text-foreground font-medium hover:-translate-y-0.5 transition shadow-soft-lg"
          >
            Crear mi cuenta gratis
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border py-10 px-6">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="Calendya" className="size-7 rounded-md" />
          <span className="font-display font-semibold tracking-tight text-lg">Calendya</span>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <Link to="/privacidad" className="hover:text-foreground">Privacidad</Link>
          <Link to="/terminos" className="hover:text-foreground">Términos</Link>
          <span>© 2026 Calendya · Hecho en Perú.</span>
        </div>
      </div>
    </footer>
  );
}

function ProPreregisterDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [negocio, setNegocio] = useState("");
  const [telefono, setTelefono] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim() || !email.trim()) {
      toast.error("Nombre y email son obligatorios");
      return;
    }
    setLoading(true);
    const { error } = await supabase.from("pro_preregistrations").insert({
      nombre: nombre.trim(),
      email: email.trim(),
      negocio: negocio.trim() || null,
      telefono: telefono.trim() || null,
    });
    setLoading(false);
    if (error) {
      toast.error("No pudimos registrarte. Intenta de nuevo.");
      return;
    }
    toast.success("¡Listo! Te avisamos cuando abramos Pro.");
    setNombre(""); setEmail(""); setNegocio(""); setTelefono("");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Preregistro Pro</DialogTitle>
          <DialogDescription>
            Déjanos tus datos y serás de los primeros en activar el plan Pro con un descuento de lanzamiento.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="pre-nombre">Nombre *</Label>
            <Input id="pre-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Tu nombre" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pre-email">Email *</Label>
            <Input id="pre-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@correo.com" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pre-negocio">Negocio</Label>
            <Input id="pre-negocio" value={negocio} onChange={(e) => setNegocio(e.target.value)} placeholder="Nombre de tu negocio" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pre-telefono">Teléfono / WhatsApp</Label>
            <Input id="pre-telefono" value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="+51 999 999 999" />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full px-6 py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:shadow-lg transition disabled:opacity-60"
          >
            {loading ? "Enviando..." : "Quiero el preregistro"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
