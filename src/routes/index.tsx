import { Logo } from "@/components/Logo";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Reveal, RotatingWord, CountUp, useScrolled } from "@/components/landing-dynamic";
import { ArrowRight, Check, Minus, Plus } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Calendya — Tu negocio agenda sola" },
      {
        name: "description",
        content:
          "Plataforma para negocios que convierte mensajes y clicks en citas confirmadas automáticamente. Adiós cuaderno.",
      },
      { property: "og:title", content: "Calendya — Tu negocio agenda sola" },
      {
        property: "og:description",
        content: "Convierte mensajes en citas confirmadas. Sin cuaderno, sin perder clientes.",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Instrument+Serif:ital@0;1&family=Outfit:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  component: Index,
});

const SERIF = "font-[family-name:var(--font-serif-lp)] font-normal";
const MONO = "font-[family-name:var(--font-mono-lp)]";
const H2 = `${SERIF} text-[clamp(40px,5.2vw,62px)] leading-[1.05] tracking-[-0.01em] text-lp-navy text-balance`;
const CTA_PRIMARY =
  "inline-flex items-center justify-center gap-2 rounded-[14px] bg-lp-blue px-[26px] py-[15px] text-[17px] font-semibold text-white transition hover:bg-lp-navy";

function Index() {
  const [proOpen, setProOpen] = useState(false);
  const { session } = useAuth();
  const navigate = useNavigate();

  // Tras el login OAuth, Supabase puede volver a "/" con el token en el hash (o ?code=).
  // supabase-js borra esa marca de la URL en cuanto la lee, así que se captura en el primer
  // render (antes de que corra cualquier efecto) para poder redirigir cuando la sesión esté lista.
  const [returnedFromOAuth] = useState(() => {
    if (typeof window === "undefined") return false;
    const { hash, search } = window.location;
    return hash.includes("access_token") || new URLSearchParams(search).has("code");
  });

  useEffect(() => {
    if (session && returnedFromOAuth) {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [session, returnedFromOAuth, navigate]);

  return (
    <div className="min-h-screen scroll-smooth bg-lp-mist font-[Outfit,sans-serif] text-lp-ink">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-lp-navy focus:px-4 focus:py-2 focus:text-white"
      >
        Saltar al contenido
      </a>
      <div className="mx-auto max-w-[1200px] px-6">
        <Header />
        <main id="main">
          <Hero />
          <Stats />
          <Problem />
          <Features />
          <HowItWorks />
          <Compare />
          <Pricing onPlanClick={() => setProOpen(true)} />
          <FAQ />
          <FinalCTA />
        </main>
        <Footer />
      </div>
      <MobileCTA />
      <ProPreregisterDialog open={proOpen} onOpenChange={setProOpen} />
    </div>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div
      className={`${MONO} mb-3.5 text-[13px] font-medium uppercase tracking-[0.08em] text-lp-rust`}
    >
      {children}
    </div>
  );
}

function Header() {
  const scrolled = useScrolled();
  const links = [
    ["#features", "Funciones"],
    ["#how", "Cómo funciona"],
    ["#pricing", "Precios"],
    ["#faq", "FAQ"],
  ];
  return (
    <nav
      aria-label="Principal"
      className={`sticky top-0 z-10 flex flex-wrap items-center justify-between gap-4 py-5 backdrop-blur-[10px] transition-shadow ${
        scrolled ? "bg-lp-mist/95 shadow-[0_1px_0_var(--color-lp-line)]" : "bg-lp-mist/85"
      }`}
    >
      <Logo size={32} />
      <div
        className={`${MONO} hidden flex-wrap justify-center gap-x-1.5 whitespace-nowrap text-[13px] font-medium uppercase tracking-[0.06em] md:flex`}
      >
        {links.map(([href, label]) => (
          <a
            key={href}
            href={href}
            className="rounded-full px-3.5 py-2 text-lp-navy transition hover:bg-lp-tint"
          >
            {label}
          </a>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <Link to="/auth" className="hidden text-sm font-medium text-lp-navy sm:inline">
          Ingresar
        </Link>
        <Link
          to="/auth"
          search={{ mode: "signup" }}
          className="whitespace-nowrap rounded-xl bg-lp-blue px-[22px] py-[13px] text-[15px] font-semibold text-white transition hover:bg-lp-navy"
        >
          Empezar gratis
        </Link>
      </div>
    </nav>
  );
}

const CITAS = [
  { h: "09:00", n: "María López", s: "Corte + tinte" },
  { h: "10:30", n: "Sofía Torres", s: "Manicura" },
  { h: "12:00", n: "Ana Ríos", s: "Peinado novia" },
  { h: "14:00", n: "Lucía Vega", s: "Facial" },
];

function Hero() {
  return (
    <header className="grid grid-cols-1 items-center gap-12 pb-[72px] pt-14 md:grid-cols-2">
      <div>
        <span
          className={`${MONO} rounded-full bg-lp-tint px-3 py-1.5 text-xs font-medium uppercase tracking-[0.06em] text-lp-blue`}
        >
          Agenda para salones y spas
        </span>
        <h1
          className={`${SERIF} mt-5 text-[clamp(52px,7vw,92px)] leading-none tracking-[-0.015em] text-lp-navy text-balance`}
        >
          Tu salón merece{" "}
          <span className="inline-block italic text-lp-blue">
            <RotatingWord words={["libertad", "tiempo", "calma"]} finalWord="tiempo" />
          </span>
          , no un cuaderno<span className="text-lp-coral">.</span>
        </h1>
        <p className="mt-5 max-w-[480px] text-xl leading-normal text-lp-soft">
          Tus clientes reservan solos, 24/7. Tú recuperas 10 horas a la semana.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/auth" search={{ mode: "signup" }} className={CTA_PRIMARY}>
            Comenzar prueba gratis
          </Link>
          <a
            href="#how"
            className="rounded-[14px] border-[1.5px] border-[#c9d2ea] bg-white px-[26px] py-[13.5px] text-[17px] font-semibold text-lp-navy transition hover:border-lp-blue"
          >
            Ver cómo funciona
          </a>
        </div>
        <p className="mt-4 text-sm text-lp-soft">
          Sin tarjeta · 10 minutos · Cancela cuando quieras
        </p>
      </div>

      <div className="relative pb-6">
        <div
          role="img"
          aria-label="Ejemplo ilustrativo: agenda del martes con cuatro citas confirmadas y 86% de ocupación"
          className="animate-pop flex flex-col gap-3 rounded-3xl bg-white p-6 shadow-[0_18px_48px_rgba(22,39,107,.16)]"
        >
          <div className="flex items-baseline justify-between gap-2">
            <div className={`${SERIF} text-[30px]`}>Martes</div>
            <div className={`${MONO} text-[13px] text-lp-soft`}>4 citas · $0 en cancelaciones</div>
          </div>
          <div className={`${MONO} grid grid-cols-6 gap-1.5 text-center text-xs font-medium`}>
            {["L 5", "M 6", "X 7", "J 8", "V 9", "S 10"].map((d) => (
              <div
                key={d}
                className={`rounded-[10px] py-2 ${d === "M 6" ? "bg-lp-blue text-white" : "bg-lp-mist text-lp-soft"}`}
              >
                {d}
              </div>
            ))}
          </div>
          {CITAS.map((c) => (
            <div
              key={c.h}
              className="grid grid-cols-[56px_1fr_auto] items-center gap-3.5 rounded-[14px] bg-lp-mist p-3.5"
            >
              <span className={`${MONO} text-sm font-medium text-lp-blue`}>{c.h}</span>
              <div className="min-w-0">
                <div className="truncate font-semibold">{c.n}</div>
                <div className="truncate text-sm text-lp-soft">{c.s}</div>
              </div>
              <span className="rounded-full bg-lp-tint px-2.5 py-1 text-xs font-semibold text-lp-navy">
                Confirmada
              </span>
            </div>
          ))}
          <div className="mt-1">
            <div className="mb-1.5 flex justify-between text-[13px] text-lp-soft">
              <span>Ocupación del día</span>
              <span className={`${MONO} text-lp-navy`}>86%</span>
            </div>
            <div className="h-2 rounded-full bg-lp-tint">
              <div className="h-full w-[86%] rounded-full bg-gradient-to-r from-lp-blue to-lp-sky" />
            </div>
          </div>
        </div>
        <div className="absolute -top-[18px] right-0 flex items-center gap-2 rounded-[14px] bg-lp-navy px-3.5 py-2.5 text-sm text-white shadow-[0_6px_20px_rgba(22,39,107,.2)] md:-right-2">
          <span className="size-2 rounded-full bg-[#5fd7a0]" aria-hidden />
          Recordatorio enviado por WhatsApp
        </div>
        <div className="absolute -bottom-1 left-0 rounded-[14px] bg-lp-coral px-[18px] py-3 text-[15px] font-semibold text-lp-ink shadow-[0_6px_20px_rgba(22,39,107,.18)] md:-left-3">
          Nueva reserva · Lucía, 16:30
        </div>
      </div>
    </header>
  );
}

function Stats() {
  const stats: { v: ReactNode; l: string }[] = [
    { v: <CountUp to={500} prefix="+" />, l: "citas reservadas por día" },
    { v: <CountUp to={30} suffix=" s" />, l: "reserva promedio" },
    { v: "0", l: "dobles reservas" },
    { v: "24/7", l: "disponibilidad" },
  ];
  const rubros = ["Salones", "Spas", "Barberías", "Estéticas", "Masajes", "Podología", "Tatuajes"];
  return (
    <>
      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-[20px] bg-lp-line md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.l} className="bg-white p-7">
            <div className={`${SERIF} text-[52px] leading-[1.1] text-lp-blue`}>{s.v}</div>
            <div className="text-[15px] text-lp-soft">{s.l}</div>
          </div>
        ))}
      </section>
      <div className="mt-8 flex flex-wrap items-center gap-2.5 text-[15px] text-lp-soft">
        <span className="mr-1.5">Para</span>
        {rubros.map((r) => (
          <span
            key={r}
            className="rounded-full border border-lp-line bg-white px-3.5 py-[7px] font-medium text-lp-navy"
          >
            {r}
          </span>
        ))}
      </div>
    </>
  );
}

function Problem() {
  const items = [
    {
      q: "“¿Tienes hueco el jueves?”",
      t: "Caos en WhatsApp",
      d: "Pierdes minutos respondiendo en vez de atender a tu cliente en silla.",
    },
    {
      q: "“Se me olvidó por completo…”",
      t: "Citas olvidadas",
      d: "Sin recordatorios, se te va hasta el 20% de ingresos.",
    },
    {
      q: "“Búscame un hueco el 15…”",
      t: "El cuaderno infinito",
      d: "Tachones, errores y cero datos. No sabes quién es tu mejor cliente.",
    },
  ];
  return (
    <section className="pt-[110px]">
      <Eyebrow>El problema</Eyebrow>
      <h2 className={`${H2} max-w-[640px]`}>El cuaderno te cuesta más de lo que crees.</h2>
      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {items.map((p, i) => (
          <Reveal key={p.t} delay={i * 60} className="flex">
            <div className="flex-1 rounded-[20px] border border-lp-line bg-white p-7 transition duration-200 hover:-translate-y-1 hover:shadow-[0_12px_32px_rgba(22,39,107,.12)]">
              <div className="text-lg text-lp-soft line-through decoration-lp-coral decoration-2">
                {p.q}
              </div>
              <h3 className={`${SERIF} mb-2 mt-[18px] text-[28px] tracking-normal`}>{p.t}</h3>
              <p className="leading-normal text-lp-soft">{p.d}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function Features() {
  const small = [
    { t: "Multi-sucursal", d: "Varias sucursales y profesionales en un solo lugar." },
    { t: "Clientes guardados", d: "Cada cliente con su historial. Sin libreta, sin Excel." },
    { t: "Marca personalizada", d: "Colores, tipografía y logo en tu página pública." },
    { t: "Cero fricción", d: "Diseñado para dueños de negocio, no para programadores." },
  ];
  return (
    <section id="features" className="pt-[110px]">
      <Eyebrow>La solución</Eyebrow>
      <h2 className={`${H2} max-w-[640px]`}>Todo lo que necesitas, nada que no.</h2>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex min-h-[260px] min-w-0 flex-col justify-end rounded-3xl bg-lp-navy p-9 text-white sm:col-span-2">
          <div className={`${MONO} text-xs uppercase tracking-[0.06em] text-[#a9c0f7]`}>
            Agenda inteligente
          </div>
          <div className={`${SERIF} mt-2 max-w-[420px] text-[38px] leading-[1.1]`}>
            Tu calendario se actualiza solo. Sin doble booking, jamás.
          </div>
          <div
            aria-hidden
            className={`${MONO} mt-6 grid max-w-[440px] grid-cols-5 gap-1.5 text-center text-[11px] font-medium text-[#a9c0f7]`}
          >
            {["L", "M", "X", "J", "V"].map((d) => (
              <div key={d}>{d}</div>
            ))}
            {[1, 1, 0, 1, 1, 0, 1, 1, 1, 0].map((on, i) => (
              <div key={i} className={`h-[22px] rounded-md ${on ? "bg-lp-blue" : "bg-white/10"}`} />
            ))}
          </div>
        </div>
        <div className="flex min-h-[260px] min-w-0 flex-col justify-end rounded-3xl bg-lp-blue p-7 text-white sm:col-span-2">
          <div className={`${SERIF} text-[32px]`}>Link de reservas</div>
          <div className="mt-1.5 leading-snug text-lp-tint">
            Comparte un link y tus clientes agendan en 30 segundos.
          </div>
          <div
            aria-hidden
            className="mt-[18px] flex flex-col gap-1.5 rounded-2xl bg-white p-3 text-lp-ink"
          >
            <div className={`${MONO} text-[11px] text-lp-soft`}>calendya.app/tu-salon</div>
            {["Corte · 45 min", "Manicura · 30 min"].map((s) => (
              <div
                key={s}
                className="flex justify-between rounded-lg bg-lp-mist px-3 py-2 text-[13px]"
              >
                <span className="font-semibold">{s}</span>
                <span className="text-lp-blue">Reservar</span>
              </div>
            ))}
          </div>
        </div>
        {small.map((f) => (
          <div
            key={f.t}
            className="rounded-3xl border border-lp-line bg-white p-7 transition duration-200 hover:-translate-y-1 hover:shadow-[0_12px_32px_rgba(22,39,107,.12)]"
          >
            <div className="size-2.5 rounded-full bg-lp-coral" aria-hidden />
            <h3 className={`${SERIF} mt-4 text-[28px] tracking-normal`}>{f.t}</h3>
            <p className="mt-1.5 leading-snug text-lp-soft">{f.d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function HowItWorks() {
  const row = "flex justify-between rounded-lg bg-lp-mist px-3 py-2 text-[13px]";
  const steps = [
    {
      n: "01",
      t: "Configura tu salón",
      d: "Nombre, horario, servicios. 5 minutos.",
      visual: (
        <>
          {[
            ["Salón", "Studio Aura"],
            ["Horario", "9:00 – 19:00"],
            ["Servicios", "12"],
          ].map(([k, v]) => (
            <div key={k} className={row}>
              <span className="text-lp-soft">{k}</span>
              <span className="font-semibold">{v}</span>
            </div>
          ))}
        </>
      ),
    },
    {
      n: "02",
      t: "Comparte tu link",
      d: "Tus clientes reservan solos desde el teléfono.",
      visual: (
        <>
          <div className={`${MONO} rounded-[10px] bg-lp-tint px-3 py-2.5 text-[13px] text-lp-navy`}>
            calendya.app/tu-salon
          </div>
          <div className="flex gap-2 text-[13px] font-semibold">
            <span className="flex-1 rounded-lg bg-lp-blue p-2 text-center text-white">Copiar</span>
            <span className="flex-1 rounded-lg border-[1.5px] border-lp-blue p-1.5 text-center text-lp-blue">
              WhatsApp
            </span>
          </div>
        </>
      ),
    },
    {
      n: "03",
      t: "Atiende y cobra",
      d: "Tu agenda llena, sin levantar el teléfono.",
      visual: (
        <div className="flex h-full items-end gap-2">
          {[40, 70, 55, 90, 65, 80].map((h, i) => (
            <div
              key={i}
              style={{ height: `${h}%` }}
              className={`flex-1 rounded-t-md ${h === 90 ? "bg-lp-coral" : "bg-lp-blue"}`}
            />
          ))}
        </div>
      ),
    },
  ];
  return (
    <section id="how" className="pt-[110px]">
      <Eyebrow>Cómo funciona</Eyebrow>
      <h2 className={H2}>Tres pasos. Listo.</h2>
      <div className="mt-10 grid gap-8 md:grid-cols-3">
        {steps.map((s, i) => (
          <Reveal key={s.n} delay={i * 60}>
            <div className="border-t-2 border-lp-navy pt-5">
              <div
                aria-hidden
                className="mb-5 flex h-[150px] flex-col justify-center gap-2 rounded-[20px] border border-lp-line bg-white p-4"
              >
                {s.visual}
              </div>
              <div className={`${MONO} text-sm font-medium text-lp-rust`}>{s.n}</div>
              <h3 className={`${SERIF} mt-2.5 text-[32px] tracking-normal`}>{s.t}</h3>
              <p className="mt-1.5 leading-snug text-lp-soft">{s.d}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function Compare() {
  const rows = [
    ["Precio inicial", "Gratis · Pro $29/mes", "$19.95/mes", "$29.99/mes"],
    ["Comisión por cliente nuevo", "0%", "20% (mín. $6)", "0% (Boost opcional, extra)"],
    ["Profesional adicional", "Incluido en Pro", "$14.95/mes c/u", "$20/mes c/u"],
    ["Recordatorios por WhatsApp", "Incluidos en Pro", "No automáticos", "Integración limitada"],
    ["Plan gratis", "Sí, sin tarjeta", "No (de pago desde 2025)", "No (prueba de 14 días)"],
  ];
  const grid = "grid grid-cols-[1.6fr_1fr_1fr_1fr]";
  return (
    <section id="comparar" className="pt-[110px]">
      <Eyebrow>Comparativa</Eyebrow>
      <h2 className={`${H2} max-w-[700px]`}>Sin comisiones por cada cliente nuevo.</h2>
      <p className="mt-4 max-w-[620px] text-lg leading-normal text-lp-soft">
        Otras plataformas cobran por equipo o se quedan con un porcentaje de tus clientes nuevos.
        Aquí pagas un precio fijo y todo lo que ganas es tuyo.
      </p>
      <div className="mt-9 overflow-x-auto rounded-[20px] border border-lp-line bg-white">
        <div
          role="table"
          aria-label="Calendya frente a otras plataformas"
          className="min-w-[680px]"
        >
          <div role="row" className={`${grid} font-semibold`}>
            <div role="columnheader" className="p-5" />
            <div role="columnheader" className="rounded-t-2xl bg-lp-navy p-5 text-white">
              Calendya
            </div>
            <div role="columnheader" className="p-5">
              Fresha
            </div>
            <div role="columnheader" className="p-5">
              Booksy
            </div>
          </div>
          {rows.map(([l, c, f, b]) => (
            <div key={l} role="row" className={`${grid} border-t border-lp-tint text-[15px]`}>
              <div role="rowheader" className="px-5 py-3.5">
                {l}
              </div>
              <div role="cell" className="bg-[#eef2fd] px-5 py-3.5 font-semibold text-lp-navy">
                {c}
              </div>
              <div role="cell" className="px-5 py-3.5 text-lp-soft">
                {f}
              </div>
              <div role="cell" className="px-5 py-3.5 text-lp-soft">
                {b}
              </div>
            </div>
          ))}
        </div>
      </div>
      <p className="mt-3.5 max-w-[700px] text-[13px] text-lp-soft">
        Datos públicos de Fresha y Booksy según comparativas de 2026 (precios en USD); pueden variar
        por país y plan. Verifícalos en cada sitio antes de decidir.
      </p>
    </section>
  );
}

type Plan = {
  name: string;
  tag?: string;
  monthly: number;
  annual: number;
  d: string;
  items: string[];
  cta: string;
  variant: "light" | "dark";
  action: "signup" | "dialog";
};

const PLANS: Plan[] = [
  {
    name: "Gratis",
    monthly: 0,
    annual: 0,
    d: "Para empezar sin compromiso.",
    items: [
      "Hasta 50 citas/mes",
      "1 sucursal",
      "Link de reservas público",
      "Clientes y agenda básica",
    ],
    cta: "Crear cuenta gratis",
    variant: "light",
    action: "signup",
  },
  {
    name: "Pro",
    tag: "Recomendado",
    monthly: 29,
    annual: 25,
    d: "Para salones que ya están creciendo.",
    items: [
      "Citas ilimitadas",
      "Hasta 3 sucursales",
      "Profesionales ilimitados",
      "Recordatorios por WhatsApp y email",
      "Marca y colores personalizados",
      "Métricas y soporte prioritario",
    ],
    cta: "Preregistro Pro",
    variant: "dark",
    action: "dialog",
  },
  {
    name: "Studio",
    tag: "Preregistro",
    monthly: 99,
    annual: 84,
    d: "Para cadenas y equipos grandes.",
    items: [
      "Todo lo del plan Pro",
      "Chat con IA para tus clientes",
      "Sucursales y equipos ilimitados",
      "Roles y permisos",
      "Google Calendar, Zapier, API",
      "Onboarding 1:1",
    ],
    cta: "Hablar con ventas",
    variant: "light",
    action: "dialog",
  },
];

type Cell = string | boolean;
const TABLE: [string, Cell, Cell, Cell][] = [
  ["Citas por mes", "50", "Ilimitadas", "Ilimitadas"],
  ["Sucursales", "1", "Hasta 3", "Ilimitadas"],
  ["Link de reservas público", true, true, true],
  ["Clientes y agenda", "Básica", true, true],
  ["Recordatorios WhatsApp y email", false, true, true],
  ["Marca y colores personalizados", false, true, true],
  ["Métricas avanzadas", false, true, true],
  ["Soporte", false, "Prioritario", "Dedicado"],
  ["Chat con IA para clientes", false, false, true],
  ["Roles y permisos", false, false, true],
  ["Integraciones (Calendar, Zapier, API)", false, false, true],
  ["Onboarding 1:1", false, false, true],
];

function TableCell({ v, hl }: { v: Cell; hl?: boolean }) {
  const base = `px-5 py-3.5 ${hl ? "bg-[#eef2fd]" : ""}`;
  if (v === true)
    return (
      <div role="cell" aria-label="Incluido" className={`${base} font-semibold text-lp-blue`}>
        ✓
      </div>
    );
  if (v === false)
    return (
      <div role="cell" aria-label="No incluido" className={`${base} text-[#6b7389]`}>
        —
      </div>
    );
  return (
    <div role="cell" className={`${base} font-medium`}>
      {v}
    </div>
  );
}

function Pricing({ onPlanClick }: { onPlanClick: () => void }) {
  const [annual, setAnnual] = useState(false);
  const grid = "grid grid-cols-[2fr_1fr_1fr_1fr]";
  const toggle = (active: boolean) =>
    `flex min-h-11 items-center rounded-full px-5 text-[15px] font-semibold transition ${
      active ? "bg-lp-blue text-white" : "text-lp-navy"
    }`;
  return (
    <section id="pricing" className="pt-[110px]">
      <Eyebrow>Precio</Eyebrow>
      <h2 className={`${H2} max-w-[640px]`}>Empieza gratis. Crece cuando quieras.</h2>
      <div
        role="group"
        aria-label="Periodo de facturación"
        className="mt-8 inline-flex gap-1 rounded-full bg-lp-tint p-1"
      >
        <button
          type="button"
          aria-pressed={!annual}
          onClick={() => setAnnual(false)}
          className={toggle(!annual)}
        >
          Mensual
        </button>
        <button
          type="button"
          aria-pressed={annual}
          onClick={() => setAnnual(true)}
          className={toggle(annual)}
        >
          Anual · ahorra 14%
        </button>
      </div>

      <div className="mt-10 grid items-stretch gap-4 md:grid-cols-3">
        {PLANS.map((p) => {
          const dark = p.variant === "dark";
          const price = annual ? p.annual : p.monthly;
          const btn = `mt-auto rounded-xl p-[13px] text-center font-semibold transition ${
            dark
              ? "bg-lp-coral text-lp-ink hover:bg-white"
              : "bg-lp-blue text-white hover:bg-lp-navy"
          }`;
          return (
            <div
              key={p.name}
              className={`flex flex-col gap-4 rounded-3xl border border-lp-line p-8 transition duration-300 hover:-translate-y-2 ${
                dark
                  ? "bg-lp-navy text-white shadow-[0_0_0_3px_var(--color-lp-coral),0_18px_48px_rgba(22,39,107,.22)]"
                  : "bg-white text-lp-ink"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`${SERIF} text-[30px]`}>{p.name}</span>
                {p.tag && (
                  <span className="rounded-full bg-lp-coral px-2.5 py-1 text-xs font-semibold text-lp-ink">
                    {p.tag}
                  </span>
                )}
              </div>
              <div>
                <span className={`${SERIF} text-[64px] tracking-[-0.01em]`}>${price}</span>
                <span className="opacity-75">
                  {" "}
                  {p.monthly === 0 ? "/ mes" : annual ? "USD / mes, facturado anual" : "USD / mes"}
                </span>
              </div>
              <div className="leading-snug opacity-85">{p.d}</div>
              <ul className="flex flex-1 flex-col gap-2 text-[15px]">
                {p.items.map((i) => (
                  <li key={i}>— {i}</li>
                ))}
              </ul>
              {p.action === "signup" ? (
                <Link to="/auth" search={{ mode: "signup" }} className={btn}>
                  {p.cta}
                </Link>
              ) : (
                <button type="button" onClick={onPlanClick} className={btn}>
                  {p.cta}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-16">
        <h3 className={`${SERIF} mb-5 text-4xl tracking-normal text-lp-navy`}>
          Compara los planes
        </h3>
        <div className="overflow-x-auto rounded-[20px] border border-lp-line bg-white">
          <div role="table" aria-label="Comparación de planes" className="min-w-[640px]">
            <div role="row" className={`${grid} text-base font-semibold`}>
              <div role="columnheader" className="p-5" />
              <div role="columnheader" className="p-5">
                Gratis
              </div>
              <div role="columnheader" className="rounded-t-2xl bg-lp-navy p-5 text-white">
                Pro
              </div>
              <div role="columnheader" className="p-5">
                Studio
              </div>
            </div>
            {TABLE.map(([l, a, b, c]) => (
              <div key={l} role="row" className={`${grid} border-t border-lp-tint text-[15px]`}>
                <div role="rowheader" className="px-5 py-3.5">
                  {l}
                </div>
                <TableCell v={a} />
                <TableCell v={b} hl />
                <TableCell v={c} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <ul className="mt-7 flex flex-wrap gap-x-7 gap-y-3 text-[15px] text-lp-soft">
        {[
          "Sin tarjeta para empezar",
          "Sin comisión por cliente",
          "Cancela cuando quieras",
          "Soporte en español",
        ].map((t) => (
          <li key={t} className="inline-flex items-center gap-1.5">
            <Check className="size-4 text-lp-blue" strokeWidth={2.5} aria-hidden /> {t}
          </li>
        ))}
      </ul>
    </section>
  );
}

function FAQ() {
  const [open, setOpen] = useState(0);
  const items = [
    [
      "¿Necesito tarjeta para empezar?",
      "No. Creas tu cuenta y configuras todo gratis. Solo pagas cuando activas un plan.",
    ],
    [
      "¿Funciona para cualquier rubro?",
      "Sí: salones, spas, barberías, estéticas, masajes, podología, tatuajes y cualquier negocio con citas.",
    ],
    [
      "¿Puedo cancelar cuando quiera?",
      "Sí. Sin contratos ni permanencia, con un click desde tu panel.",
    ],
    [
      "¿Mis clientes necesitan instalar algo?",
      "No. Abren tu link y agendan en 30 segundos desde el navegador.",
    ],
  ];
  return (
    <section id="faq" className="grid gap-12 pt-[110px] md:grid-cols-2">
      <h2 className={H2}>Lo que más nos preguntan.</h2>
      <div className="flex flex-col">
        {items.map(([q, a], i) => {
          const isOpen = open === i;
          return (
            <div key={q} className="border-t border-lp-line py-2">
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={`faq-${i}`}
                onClick={() => setOpen(isOpen ? -1 : i)}
                className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-4 py-3 text-left text-xl font-medium"
              >
                <span>{q}</span>
                {isOpen ? (
                  <Minus className="size-5 shrink-0 text-lp-blue" aria-hidden />
                ) : (
                  <Plus className="size-5 shrink-0 text-lp-blue" aria-hidden />
                )}
              </button>
              <div
                id={`faq-${i}`}
                hidden={!isOpen}
                className="mt-2.5 max-w-[520px] leading-normal text-lp-soft"
              >
                {a}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section className="mt-[110px] flex flex-wrap items-center justify-between gap-6 rounded-[32px] bg-lp-blue p-[clamp(36px,6vw,80px)] text-white">
      <h2
        className={`${SERIF} max-w-[560px] flex-[1_1_360px] text-[clamp(40px,5.5vw,72px)] leading-[1.05] tracking-[-0.01em]`}
      >
        Empieza hoy. Cobra mañana.
      </h2>
      <div className="flex flex-col items-start gap-2.5">
        <Link
          to="/auth"
          search={{ mode: "signup" }}
          className="rounded-[14px] bg-lp-coral px-7 py-4 text-lg font-semibold text-lp-ink transition hover:bg-white"
        >
          Crear mi cuenta gratis
        </Link>
        <span className="text-sm text-lp-tint">
          Sin tarjeta · 10 minutos · Cancela cuando quieras
        </span>
      </div>
    </section>
  );
}

function MobileCTA() {
  const scrolled = useScrolled(480);
  if (!scrolled) return null;
  return (
    <div className="fixed inset-x-3 bottom-3 z-[15] flex items-center justify-between gap-3 rounded-2xl border border-lp-line bg-white py-2.5 pl-4 pr-2.5 shadow-[0_12px_32px_rgba(22,39,107,.22)] md:hidden">
      <span className="text-[15px] font-semibold text-lp-navy">Prueba gratis, sin tarjeta</span>
      <Link
        to="/auth"
        search={{ mode: "signup" }}
        className="rounded-xl bg-lp-blue px-4 py-2.5 text-sm font-semibold text-white"
      >
        Empezar
      </Link>
    </div>
  );
}

function Footer() {
  return (
    <footer className="mt-4 flex flex-wrap items-center justify-between gap-3 py-10 pb-24 text-sm text-lp-soft md:pb-10">
      <Logo size={28} />
      <span className="flex gap-5">
        <Link to="/privacidad" className="transition hover:text-lp-navy">
          Privacidad
        </Link>
        <Link to="/terminos" className="transition hover:text-lp-navy">
          Términos
        </Link>
      </span>
      <span>© 2026 Calendya · Hecho en Perú</span>
    </footer>
  );
}

function ProPreregisterDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
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
    setNombre("");
    setEmail("");
    setNegocio("");
    setTelefono("");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Preregistro Pro</DialogTitle>
          <DialogDescription>
            Déjanos tus datos y serás de los primeros en activar el plan Pro con un descuento de
            lanzamiento.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="pre-nombre">Nombre *</Label>
            <Input
              id="pre-nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Tu nombre"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pre-email">Email *</Label>
            <Input
              id="pre-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@correo.com"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pre-negocio">Negocio</Label>
            <Input
              id="pre-negocio"
              value={negocio}
              onChange={(e) => setNegocio(e.target.value)}
              placeholder="Nombre de tu negocio"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pre-telefono">Teléfono / WhatsApp</Label>
            <Input
              id="pre-telefono"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="+51 999 999 999"
            />
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
