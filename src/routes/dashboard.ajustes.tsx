import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMyBusiness } from "@/lib/business";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/ajustes")({
  component: AjustesPage,
});

function AjustesPage() {
  const { data: business } = useMyBusiness();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    if (business) { setName(business.name); setPhone(business.phone ?? ""); }
  }, [business]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("businesses").update({ name, phone: phone || null }).eq("id", business!.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["my-business"] }); toast.success("Guardado"); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!business) return <p className="text-muted-foreground">Primero crea tu salón.</p>;

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
          <div><Label>Teléfono</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !name}>Guardar</Button>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6 space-y-2">
          <Label>Tu página pública</Label>
          <div className="flex gap-2">
            <Input readOnly value={url} />
            <Button variant="outline" onClick={() => { navigator.clipboard.writeText(url); toast.success("Copiado"); }}>Copiar</Button>
          </div>
          <p className="text-xs text-muted-foreground">Comparte este enlace con tus clientes para que reserven solos.</p>
        </CardContent>
      </Card>
    </div>
  );
}