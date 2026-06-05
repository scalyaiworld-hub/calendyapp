import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMyBusiness } from "@/lib/business";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { PhoneInput } from "@/components/PhoneInput";
import { DEFAULT_COUNTRY_CODE } from "@/lib/countries";

export const Route = createFileRoute("/dashboard/ajustes")({
  component: AjustesPage,
});

function AjustesPage() {
  const { data: business } = useMyBusiness();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [waCountry, setWaCountry] = useState(DEFAULT_COUNTRY_CODE);
  const [waNumber, setWaNumber] = useState("");

  useEffect(() => {
    if (business) {
      setName(business.name);
      setWaCountry((business as any).whatsapp_country_code ?? DEFAULT_COUNTRY_CODE);
      setWaNumber((business as any).whatsapp_number ?? business.phone ?? "");
    }
  }, [business]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("businesses")
        .update({
          name,
          whatsapp_country_code: waCountry,
          whatsapp_number: waNumber || null,
          phone: waNumber ? `${waCountry} ${waNumber}` : null,
        })
        .eq("id", business!.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["my-business"] }); toast.success("Guardado"); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!business) return <p className="text-muted-foreground">Primero crea tu salón.</p>;

  const { data: locations } = useQuery({
    queryKey: ["locations-count", business?.id],
    enabled: !!business?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("locations")
        .select("id", { count: "exact", head: true })
        .eq("business_id", business!.id)
        .is("deleted_at", null)
        .eq("is_active", true);
      if (error) throw error;
      return { count: data?.length ?? 0 };
    },
  });

  const hasLocations = (locations?.count ?? 0) > 0;
  const url = typeof window !== "undefined" ? `${window.location.origin}/b/${business.slug}` : `/b/${business.slug}`;

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h1 className="font-display text-3xl mb-1">Ajustes</h1>
        <p className="text-muted-foreground">Información de tu salón.</p>
      </div>
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div><Label>Nombre</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div>
            <Label>WhatsApp</Label>
            <div className="mt-1.5">
              <PhoneInput
                countryCode={waCountry}
                number={waNumber}
                onCountryCodeChange={setWaCountry}
                onNumberChange={setWaNumber}
              />
            </div>
          </div>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !name}>Guardar</Button>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6 space-y-2">
          <Label>Tu página pública</Label>
          <div className="flex gap-2">
            <Input readOnly value={url} />
            <Button
              variant="outline"
              disabled={!hasLocations}
              onClick={() => { navigator.clipboard.writeText(url); toast.success("Copiado"); }}
              title={hasLocations ? undefined : "Crea al menos una sucursal para activar el link de reservas"}
            >
              Copiar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {hasLocations
              ? "Comparte este enlace con tus clientes para que reserven solos."
              : "Crea al menos una sucursal para activar el link de reservas."}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}