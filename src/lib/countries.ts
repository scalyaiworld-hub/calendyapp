export interface Country {
  code: string; // dial code with +
  iso: string;
  flag: string;
  name: string;
}

export const COUNTRIES: Country[] = [
  { code: "+51", iso: "PE", flag: "🇵🇪", name: "Perú" },
  { code: "+52", iso: "MX", flag: "🇲🇽", name: "México" },
  { code: "+54", iso: "AR", flag: "🇦🇷", name: "Argentina" },
  { code: "+55", iso: "BR", flag: "🇧🇷", name: "Brasil" },
  { code: "+56", iso: "CL", flag: "🇨🇱", name: "Chile" },
  { code: "+57", iso: "CO", flag: "🇨🇴", name: "Colombia" },
  { code: "+58", iso: "VE", flag: "🇻🇪", name: "Venezuela" },
  { code: "+591", iso: "BO", flag: "🇧🇴", name: "Bolivia" },
  { code: "+593", iso: "EC", flag: "🇪🇨", name: "Ecuador" },
  { code: "+595", iso: "PY", flag: "🇵🇾", name: "Paraguay" },
  { code: "+598", iso: "UY", flag: "🇺🇾", name: "Uruguay" },
  { code: "+502", iso: "GT", flag: "🇬🇹", name: "Guatemala" },
  { code: "+503", iso: "SV", flag: "🇸🇻", name: "El Salvador" },
  { code: "+504", iso: "HN", flag: "🇭🇳", name: "Honduras" },
  { code: "+505", iso: "NI", flag: "🇳🇮", name: "Nicaragua" },
  { code: "+506", iso: "CR", flag: "🇨🇷", name: "Costa Rica" },
  { code: "+507", iso: "PA", flag: "🇵🇦", name: "Panamá" },
  { code: "+509", iso: "HT", flag: "🇭🇹", name: "Haití" },
  { code: "+1", iso: "US", flag: "🇺🇸", name: "Estados Unidos" },
  { code: "+34", iso: "ES", flag: "🇪🇸", name: "España" },
];

export const DEFAULT_COUNTRY_CODE = "+51";

export function findCountry(code: string | null | undefined): Country {
  return COUNTRIES.find((c) => c.code === code) ?? COUNTRIES[0];
}
