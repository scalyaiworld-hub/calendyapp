import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** Devuelve true cuando el elemento entra en pantalla (una sola vez). */
function useInView<T extends Element>(threshold = 0.15) {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
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

/** Aparece con fade + desplazamiento al entrar en pantalla. */
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
        "transition-all duration-700 ease-out",
        seen ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Palabra que rota con fundido. Reserva el ancho de la más larga para no mover el layout. */
export function RotatingWord({ words, interval = 2800 }: { words: string[]; interval?: number }) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (prefersReducedMotion() || words.length < 2) return;
    let swap: ReturnType<typeof setTimeout>;
    const timer = setInterval(() => {
      setVisible(false);
      swap = setTimeout(() => {
        setIndex((i) => (i + 1) % words.length);
        setVisible(true);
      }, 280);
    }, interval);
    return () => {
      clearInterval(timer);
      clearTimeout(swap);
    };
  }, [words, interval]);

  return (
    <span className="inline-grid align-baseline">
      {words.map((w) => (
        <span key={w} aria-hidden className="col-start-1 row-start-1 invisible">
          {w}
        </span>
      ))}
      <span
        className={cn(
          "col-start-1 row-start-1 transition-all duration-300",
          visible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2",
        )}
      >
        {words[index]}
      </span>
    </span>
  );
}

/** Cuenta desde 0 hasta `to` cuando entra en pantalla. */
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
  const [value, setValue] = useState(to);

  useEffect(() => {
    if (!seen || prefersReducedMotion()) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(to * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    setValue(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [seen, to, duration]);

  return (
    <span ref={ref} className="tabular-nums">
      {prefix}
      {value}
      {suffix}
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

const BASE_APPTS: Appt[] = [
  { h: "09:00", n: "María López", s: "Corte + tinte", c: "bg-primary/10 border-primary/30 text-primary" },
  { h: "10:30", n: "Sofía Torres", s: "Manicura", c: "bg-rose-100 border-rose-200 text-rose-700" },
  { h: "12:00", n: "Ana Ríos", s: "Peinado novia", c: "bg-primary/10 border-primary/30 text-primary" },
  { h: "14:00", n: "Lucía Vega", s: "Facial", c: "bg-muted border-border text-muted-foreground" },
];

const INCOMING: (Appt & { via: string })[] = [
  { h: "15:30", n: "Camila Ruiz", s: "Corte", c: "bg-primary/10 border-primary/30 text-primary", via: "Link de reservas" },
  { h: "16:30", n: "Valeria Soto", s: "Uñas gel", c: "bg-rose-100 border-rose-200 text-rose-700", via: "WhatsApp" },
  { h: "17:30", n: "Daniela Paz", s: "Balayage", c: "bg-primary/10 border-primary/30 text-primary", via: "Link de reservas" },
];

/** Mini agenda de ejemplo: cada pocos segundos entra una reserva nueva. Es una demostración, no datos reales. */
export function LiveAgenda() {
  const [added, setAdded] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const timer = setInterval(() => {
      setAdded((n) => (n + 1) % (INCOMING.length + 2));
    }, 3200);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (added > 0 && added <= INCOMING.length) {
      setFlash(INCOMING[added - 1].via);
      const t = setTimeout(() => setFlash(null), 2200);
      return () => clearTimeout(t);
    }
    setFlash(null);
  }, [added]);

  const shown = Math.min(added, INCOMING.length);
  const list: Appt[] = [...BASE_APPTS, ...INCOMING.slice(0, shown)].slice(-4);

  return (
    <div className="bg-background rounded-2xl aspect-[4/3] w-full p-5 flex flex-col gap-3 overflow-hidden">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-medium">Hoy · Martes 6</span>
        <span className="inline-flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-primary" />
          <span className="tabular-nums">{8 + shown}</span> citas
        </span>
      </div>
      <div className="flex-1 space-y-2 overflow-hidden" role="img" aria-label="Ejemplo de agenda del día con citas que se van sumando">
        {list.map((a) => (
          <div
            key={a.h}
            className={cn("flex items-center gap-3 rounded-lg border px-3 py-2 animate-pop", a.c)}
          >
            <span className="font-mono text-xs tabular-nums">{a.h}</span>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold truncate text-foreground">{a.n}</div>
              <div className="text-xs truncate opacity-80">{a.s}</div>
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
        <span className="size-1.5 rounded-full bg-primary animate-pulse" />
        Nueva reserva · {flash ?? ""}
      </div>
    </div>
  );
}
