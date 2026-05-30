import { supabase } from "@/integrations/supabase/client";

export interface Slot {
  starts_at: Date;
  ends_at: Date;
}

/**
 * Returns available start-time slots for a given service on a given date.
 * Stepping is in the service duration to keep the booking page simple.
 */
export async function getAvailableSlots(opts: {
  businessId: string;
  serviceId: string;
  date: Date; // any time in the target date — we use local Y-M-D
}): Promise<Slot[]> {
  const { businessId, serviceId, date } = opts;

  const { data: svc, error: svcErr } = await supabase
    .from("services")
    .select("duration_minutes")
    .eq("id", serviceId)
    .single();
  if (svcErr || !svc) return [];

  const dow = date.getDay();
  const { data: rules } = await supabase
    .from("availability_rules")
    .select("start_time,end_time")
    .eq("business_id", businessId)
    .eq("day_of_week", dow);
  if (!rules || rules.length === 0) return [];

  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const { data: appts } = await supabase
    .from("appointments")
    .select("starts_at,ends_at,status")
    .eq("business_id", businessId)
    .in("status", ["pending", "booked"])
    .gte("starts_at", dayStart.toISOString())
    .lt("starts_at", dayEnd.toISOString());

  const slots: Slot[] = [];
  const stepMin = svc.duration_minutes;
  const now = Date.now();
  const minStart = now + 30 * 60 * 1000;

  for (const rule of rules) {
    const [sh, sm] = String(rule.start_time).split(":").map(Number);
    const [eh, em] = String(rule.end_time).split(":").map(Number);
    const winStart = new Date(dayStart);
    winStart.setHours(sh, sm, 0, 0);
    const winEnd = new Date(dayStart);
    winEnd.setHours(eh, em, 0, 0);

    for (
      let t = new Date(winStart);
      t.getTime() + stepMin * 60_000 <= winEnd.getTime();
      t = new Date(t.getTime() + stepMin * 60_000)
    ) {
      const slotStart = new Date(t);
      const slotEnd = new Date(t.getTime() + stepMin * 60_000);
      if (slotStart.getTime() < minStart) continue;

      const overlaps = (appts ?? []).some((a) => {
        const aS = new Date(a.starts_at).getTime();
        const aE = new Date(a.ends_at).getTime();
        return slotStart.getTime() < aE && slotEnd.getTime() > aS;
      });
      if (!overlaps) slots.push({ starts_at: slotStart, ends_at: slotEnd });
    }
  }

  return slots;
}