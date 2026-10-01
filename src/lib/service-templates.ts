export interface ServiceTemplate {
  name: string;
  duration_minutes: number;
  price_cents: number;
}

export type Industry = "peluqueria" | "barberia" | "spa" | "unas" | "estetica";

export const INDUSTRIES: { id: Industry; label: string; emoji: string; description: string }[] = [
  {
    id: "peluqueria",
    label: "Peluquería",
    emoji: "💇‍♀️",
    description: "Cortes, color, tratamientos",
  },
  {
    id: "barberia",
    label: "Barbería",
    emoji: "💈",
    description: "Corte caballero, barba, afeitado",
  },
  { id: "spa", label: "Spa & Masajes", emoji: "🧖‍♀️", description: "Masajes, relajación, faciales" },
  { id: "unas", label: "Uñas", emoji: "💅", description: "Manicure, pedicure, nail art" },
  { id: "estetica", label: "Estética", emoji: "✨", description: "Facial, depilación, pestañas" },
];

export const SERVICE_TEMPLATES: Record<Industry, ServiceTemplate[]> = {
  peluqueria: [
    { name: "Corte mujer", duration_minutes: 45, price_cents: 5000 },
    { name: "Corte niño/niña", duration_minutes: 30, price_cents: 2500 },
    { name: "Lavado + peinado", duration_minutes: 30, price_cents: 3500 },
    { name: "Brushing", duration_minutes: 45, price_cents: 4500 },
    { name: "Planchado", duration_minutes: 45, price_cents: 5000 },
    { name: "Tinte completo", duration_minutes: 120, price_cents: 12000 },
    { name: "Retoque de raíz", duration_minutes: 90, price_cents: 8000 },
    { name: "Mechas / Balayage", duration_minutes: 180, price_cents: 20000 },
    { name: "Tratamiento capilar", duration_minutes: 60, price_cents: 7000 },
    { name: "Botox capilar", duration_minutes: 90, price_cents: 12000 },
    { name: "Alisado / Keratina", duration_minutes: 180, price_cents: 25000 },
    { name: "Peinado de novia", duration_minutes: 90, price_cents: 15000 },
  ],
  barberia: [
    { name: "Corte caballero", duration_minutes: 30, price_cents: 3000 },
    { name: "Corte + barba", duration_minutes: 45, price_cents: 4500 },
    { name: "Arreglo de barba", duration_minutes: 20, price_cents: 2000 },
    { name: "Afeitado clásico", duration_minutes: 30, price_cents: 2500 },
    { name: "Diseño de barba", duration_minutes: 30, price_cents: 3000 },
    { name: "Corte niño", duration_minutes: 25, price_cents: 2000 },
    { name: "Lavado + corte", duration_minutes: 40, price_cents: 3500 },
    { name: "Coloración cabello", duration_minutes: 60, price_cents: 6000 },
    { name: "Mascarilla negra (black mask)", duration_minutes: 15, price_cents: 1500 },
    { name: "Tratamiento anti-caída", duration_minutes: 30, price_cents: 4000 },
  ],
  spa: [
    { name: "Masaje relajante 60min", duration_minutes: 60, price_cents: 9000 },
    { name: "Masaje relajante 90min", duration_minutes: 90, price_cents: 13000 },
    { name: "Masaje descontracturante", duration_minutes: 60, price_cents: 10000 },
    { name: "Masaje con piedras calientes", duration_minutes: 75, price_cents: 12000 },
    { name: "Drenaje linfático", duration_minutes: 60, price_cents: 10000 },
    { name: "Reflexología podal", duration_minutes: 45, price_cents: 7000 },
    { name: "Exfoliación corporal", duration_minutes: 45, price_cents: 8000 },
    { name: "Envoltura de chocolate", duration_minutes: 60, price_cents: 10000 },
    { name: "Aromaterapia", duration_minutes: 60, price_cents: 9000 },
    { name: "Ritual de pareja", duration_minutes: 90, price_cents: 22000 },
  ],
  unas: [
    { name: "Manicure clásico", duration_minutes: 45, price_cents: 3000 },
    { name: "Manicure semipermanente", duration_minutes: 60, price_cents: 5000 },
    { name: "Pedicure clásico", duration_minutes: 60, price_cents: 4000 },
    { name: "Pedicure spa", duration_minutes: 75, price_cents: 6000 },
    { name: "Pedicure semipermanente", duration_minutes: 75, price_cents: 6500 },
    { name: "Uñas acrílicas", duration_minutes: 90, price_cents: 8000 },
    { name: "Uñas en gel", duration_minutes: 90, price_cents: 8500 },
    { name: "Retiro de uñas", duration_minutes: 30, price_cents: 2000 },
    { name: "Nail art (por uña)", duration_minutes: 20, price_cents: 1000 },
    { name: "Diseño francés", duration_minutes: 30, price_cents: 1500 },
  ],
  estetica: [
    { name: "Limpieza facial profunda", duration_minutes: 60, price_cents: 8000 },
    { name: "Hidratación facial", duration_minutes: 60, price_cents: 7000 },
    { name: "Tratamiento anti-edad", duration_minutes: 60, price_cents: 10000 },
    { name: "Microdermoabrasión", duration_minutes: 45, price_cents: 9000 },
    { name: "Peeling químico", duration_minutes: 45, price_cents: 12000 },
    { name: "Diseño de cejas", duration_minutes: 20, price_cents: 2000 },
    { name: "Tinte de cejas", duration_minutes: 30, price_cents: 2500 },
    { name: "Lifting de pestañas", duration_minutes: 60, price_cents: 8000 },
    { name: "Extensiones de pestañas", duration_minutes: 120, price_cents: 15000 },
    { name: "Depilación facial cera", duration_minutes: 20, price_cents: 2000 },
    { name: "Depilación piernas completas", duration_minutes: 45, price_cents: 5000 },
    { name: "Depilación bikini", duration_minutes: 30, price_cents: 3500 },
    { name: "Depilación axilas", duration_minutes: 15, price_cents: 1500 },
  ],
};
