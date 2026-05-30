export interface CatalogService {
  name: string;
  duration_minutes: number;
  price_cents: number;
  description?: string;
  category: string;
}

export const SPA_CATALOG: CatalogService[] = [
  // Cabello
  { category: "Cabello", name: "Corte mujer", duration_minutes: 45, price_cents: 5000 },
  { category: "Cabello", name: "Corte hombre", duration_minutes: 30, price_cents: 3000 },
  { category: "Cabello", name: "Corte niño", duration_minutes: 30, price_cents: 2500 },
  { category: "Cabello", name: "Lavado + peinado", duration_minutes: 30, price_cents: 3500 },
  { category: "Cabello", name: "Brushing / Planchado", duration_minutes: 45, price_cents: 4500 },
  { category: "Cabello", name: "Tinte completo", duration_minutes: 120, price_cents: 12000 },
  { category: "Cabello", name: "Retoque de raíz", duration_minutes: 90, price_cents: 8000 },
  { category: "Cabello", name: "Mechas / Balayage", duration_minutes: 180, price_cents: 20000 },
  { category: "Cabello", name: "Tratamiento capilar", duration_minutes: 60, price_cents: 7000 },
  { category: "Cabello", name: "Botox capilar", duration_minutes: 90, price_cents: 12000 },
  { category: "Cabello", name: "Alisado / Keratina", duration_minutes: 180, price_cents: 25000 },

  // Uñas
  { category: "Uñas", name: "Manicure clásico", duration_minutes: 45, price_cents: 3000 },
  { category: "Uñas", name: "Manicure semipermanente", duration_minutes: 60, price_cents: 5000 },
  { category: "Uñas", name: "Pedicure clásico", duration_minutes: 60, price_cents: 4000 },
  { category: "Uñas", name: "Pedicure spa", duration_minutes: 75, price_cents: 6000 },
  { category: "Uñas", name: "Uñas acrílicas / gel", duration_minutes: 90, price_cents: 8000 },
  { category: "Uñas", name: "Nail art", duration_minutes: 30, price_cents: 2000 },

  // Estética facial
  { category: "Facial", name: "Limpieza facial profunda", duration_minutes: 60, price_cents: 8000 },
  { category: "Facial", name: "Hidratación facial", duration_minutes: 60, price_cents: 7000 },
  { category: "Facial", name: "Tratamiento anti-edad", duration_minutes: 60, price_cents: 10000 },
  { category: "Facial", name: "Microdermoabrasión", duration_minutes: 45, price_cents: 9000 },
  { category: "Facial", name: "Depilación facial con cera", duration_minutes: 20, price_cents: 2000 },

  // Cuerpo / Spa
  { category: "Spa", name: "Masaje relajante 60min", duration_minutes: 60, price_cents: 9000 },
  { category: "Spa", name: "Masaje relajante 90min", duration_minutes: 90, price_cents: 13000 },
  { category: "Spa", name: "Masaje descontracturante", duration_minutes: 60, price_cents: 10000 },
  { category: "Spa", name: "Drenaje linfático", duration_minutes: 60, price_cents: 10000 },
  { category: "Spa", name: "Exfoliación corporal", duration_minutes: 45, price_cents: 8000 },
  { category: "Spa", name: "Depilación piernas completas", duration_minutes: 45, price_cents: 5000 },
  { category: "Spa", name: "Depilación axilas", duration_minutes: 15, price_cents: 1500 },
  { category: "Spa", name: "Depilación bikini", duration_minutes: 30, price_cents: 3500 },

  // Pestañas y cejas
  { category: "Pestañas y cejas", name: "Diseño de cejas", duration_minutes: 20, price_cents: 2000 },
  { category: "Pestañas y cejas", name: "Tinte de cejas", duration_minutes: 30, price_cents: 2500 },
  { category: "Pestañas y cejas", name: "Tinte de pestañas", duration_minutes: 30, price_cents: 3000 },
  { category: "Pestañas y cejas", name: "Lifting de pestañas", duration_minutes: 60, price_cents: 8000 },
  { category: "Pestañas y cejas", name: "Extensiones de pestañas", duration_minutes: 120, price_cents: 15000 },
];

export const SPA_CATEGORIES = Array.from(new Set(SPA_CATALOG.map((s) => s.category)));