import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

/** Devuelve true cuando el elemento entra en pantalla (una sola vez). */
function useInView<T extends Element>(threshold = 0.15) {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion() || typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold, rootMargin: "0px 0px -40px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return [ref, seen] as const;
}

/** Aparece con un fade corto al entrar en pantalla. Úsalo con moderación. */
export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const [ref, seen] = useInView<HTMLDivElement>();
  return (
    <div
      ref={ref}
      style={{ transitionDelay: seen ? `${delay}ms` : "0ms" }}
      className={cn(
        "transition-all duration-500 ease-out",
        seen ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Palabra que rota con fundido y se detiene tras `loops` vueltas en `finalWord`
 * (WCAG 2.2.2: nada se mueve solo indefinidamente). Reserva el ancho de la más larga.
 */
export function RotatingWord({
  words,
  finalWord,
  loops = 2,
  interval = 4000,
}: {
  words: string[];
  finalWord: string;
  loops?: number;
  interval?: number;
}) {
  const [word, setWord] = useState(finalWord);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (prefersReducedMotion() || words.length < 2) return;
    const total = words.length * loops;
    let step = 0;
    let swap: ReturnType<typeof setTimeout> | undefined;

    const next = () => {
      if (document.hidden) return;
      step += 1;
      setVisible(false);
      swap = setTimeout(() => {
        setWord(step >= total ? finalWord : words[step % words.length]);
        setVisible(true);
      }, 300);
      if (step >= total) clearInterval(timer);
    };

    const timer = setInterval(next, interval);
    return () => {
      clearInterval(timer);
      if (swap) clearTimeout(swap);
    };
  }, [words, finalWord, loops, interval]);

  return (
    <span className="inline-grid align-baseline">
      {words.map((w) => (
        <span key={w} aria-hidden className="col-start-1 row-start-1 invisible">
          {w}
        </span>
      ))}
      <span
        className={cn(
          "col-start-1 row-start-1 transition-opacity duration-300",
          visible ? "opacity-100" : "opacity-0",
        )}
      >
        {word}
      </span>
    </span>
  );
}

/** Cuenta desde 0 hasta `to` cuando entra en pantalla. Los lectores de pantalla leen el valor final. */
export function CountUp({
  to,
  prefix = "",
  suffix = "",
  duration = 1200,
}: {
  to: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
}) {
  const [ref, seen] = useInView<HTMLSpanElement>(0.4);
  const [value, setValue] = useState(0);
  const final = `${prefix}${to}${suffix}`;

  useEffect(() => {
    if (!seen) return;
    if (prefersReducedMotion()) {
      setValue(to);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      setValue(Math.round(to * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [seen, to, duration]);

  return (
    <span ref={ref} className="tabular-nums">
      <span className="sr-only">{final}</span>
      <span aria-hidden className="inline-grid">
        <span className="col-start-1 row-start-1 invisible">{final}</span>
        <span className="col-start-1 row-start-1">
          {prefix}
          {value}
          {suffix}
        </span>
      </span>
    </span>
  );
}

/** true cuando la página se desplazó más de `offset` px. */
export function useScrolled(offset = 8) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > offset);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [offset]);
  return scrolled;
}

type Appt = { h: string; n: string; s: string; c: string };

const TONE_A = "bg-primary/10 border-primary/30 text-primary";
const TONE_B = "bg-muted border-border text-foreground/70";

const BASE_APPTS: Appt[] = [
  { h: "09:00", n: "María López", s: "Corte + tinte", c: TONE_A },
  { h: "10:30", n: "Sofía Torres", s: "Manicura", c: TONE_B },
  { h: "12:00", n: "Ana Ríos", s: "Peinado novia", c: TONE_A },
  { h: "14:00", n: "Lucía Vega", s: "Facial", c: TONE_B },
];

const INCOMING: (Appt & { via: string })[] = [
  { h: "15:30", n: "Camila Ruiz", s: "Corte", c: TONE_A, via: "Link de reservas" },
  { h: "16:30", n: "Valeria Soto", s: "Uñas gel", c: TONE_B, via: "WhatsApp" },
  { h: "17:30", n: "Daniela Paz", s: "Balayage", c: TONE_A, via: "Link de reservas" },
];

/**
 * Agenda de ejemplo (ilustrativa, no son datos reales). Empieza al entrar en pantalla, suma las
 * reservas una vez y se queda en el estado final. Se pausa con el mouse o el foco encima.
 */
export function LiveAgenda() {
  const [ref, inView] = useInView<HTMLDivElement>(0.4);
  const [added, setAdded] = useState(0);
  const [paused, setPaused] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    if (prefersReducedMotion()) setAdded(INCOMING.length);
  }, []);

  useEffect(() => {
    if (!inView || paused || added >= INCOMING.length) return;
    const t = setTimeout(() => setAdded((n) => n + 1), 2600);
    return () => clearTimeout(t);
  }, [inView, paused, added]);

  useEffect(() => {
    if (added > 0 && added <= INCOMING.length && !prefersReducedMotion()) {
      setFlash(INCOMING[added - 1].via);
      const t = setTimeout(() => setFlash(null), 2000);
      return () => clearTimeout(t);
    }
    setFlash(null);
  }, [added]);

  const list: Appt[] = [...BASE_APPTS, ...INCOMING.slice(0, added)].slice(-4);

  return (
    <div
      ref={ref}
      role="img"
      aria-label="Ejemplo ilustrativo: agenda del día con reservas que entran por link y WhatsApp"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="bg-background rounded-2xl aspect-[4/3] w-full p-5 flex flex-col gap-3 overflow-hidden"
    >
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-medium">Ejemplo · Martes 6</span>
        <span className="inline-flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-primary" />
          <span className="tabular-nums">{8 + added}</span> citas
        </span>
      </div>
      <div className="flex-1 space-y-2 overflow-hidden">
        {list.map((a) => (
          <div
            key={a.h}
            className={cn("flex items-center gap-3 rounded-lg border px-3 py-2 animate-pop", a.c)}
          >
            <span className="font-mono text-xs tabular-nums">{a.h}</span>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold truncate text-foreground">{a.n}</div>
              <div className="text-xs truncate text-foreground/70">{a.s}</div>
            </div>
          </div>
        ))}
      </div>
      <div
        aria-hidden
        className={cn(
          "text-xs inline-flex items-center gap-1.5 self-start rounded-full bg-primary/10 text-primary px-2.5 py-1 transition-all duration-300",
          flash ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1",
        )}
      >
        <span className="size-1.5 rounded-full bg-primary" />
        Nueva reserva · {flash ?? ""}
      </div>
    </div>
  );
}
