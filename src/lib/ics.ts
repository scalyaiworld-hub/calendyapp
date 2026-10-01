// Generador de calendarios iCalendar (RFC 5545) para suscribirse por URL desde Google/Apple/Outlook.

export type IcsEvent = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  summary: string;
  description?: string;
  status: "CONFIRMED" | "TENTATIVE";
};

export function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Doblado de líneas a 75 octetos (UTF-8) sin cortar caracteres; las continuaciones empiezan con un espacio. */
export function icsFold(line: string): string[] {
  const enc = new TextEncoder();
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const len = enc.encode(ch).length;
    if (bytes + len > limit) {
      out.push(current);
      current = " ";
      bytes = 1;
      limit = 75;
    }
    current += ch;
    bytes += len;
  }
  out.push(current);
  return out;
}

export function icsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function buildIcs(input: { name: string; events: IcsEvent[]; now?: Date }): string {
  const stamp = icsDate(input.now ?? new Date());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Calendya//Agenda//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsEscape(input.name)}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];
  for (const e of input.events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.id}@calendya`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsDate(e.startsAt)}`,
      `DTEND:${icsDate(e.endsAt)}`,
      `SUMMARY:${icsEscape(e.summary)}`,
      ...(e.description ? [`DESCRIPTION:${icsEscape(e.description)}`] : []),
      `STATUS:${e.status}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.flatMap(icsFold).join("\r\n") + "\r\n";
}
