import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ImageIcon, X, Upload, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Props = {
  value: string | null;
  onChange: (url: string | null) => void;
  templates?: string[];
  label?: string;
  shape?: "square" | "rounded" | "circle";
  previewClassName?: string;
};

export function ImagePicker({
  value,
  onChange,
  templates = [],
  label = "Imagen",
  shape = "rounded",
  previewClassName,
}: Props) {
  const [url, setUrl] = useState(value ?? "");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const shapeCls =
    shape === "circle"
      ? "rounded-full aspect-square"
      : shape === "square"
        ? "rounded-md aspect-square"
        : "rounded-lg aspect-[16/9]";

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("El archivo debe ser una imagen");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("La imagen debe pesar menos de 5MB");
      return;
    }
    setUploading(true);
    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData.user) throw new Error("Debes iniciar sesión");
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${userData.user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("business-images").upload(path, file, {
        cacheControl: "31536000",
        upsert: false,
        contentType: file.type,
      });
      if (upErr) throw upErr;
      // Private bucket → use a long-lived signed URL (10 years)
      const { data: signed, error: signErr } = await supabase.storage
        .from("business-images")
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
      if (signErr || !signed?.signedUrl) throw signErr || new Error("No se pudo generar la URL");
      onChange(signed.signedUrl);
      setUrl(signed.signedUrl);
      toast.success("Imagen subida");
    } catch (e: any) {
      toast.error(e.message || "Error al subir la imagen");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-3">
      <Label className="block">
        {label} <span className="text-xs text-muted-foreground font-normal">(opcional)</span>
      </Label>

      <div
        className={cn(
          "relative w-full bg-muted/40 border border-dashed border-border overflow-hidden flex items-center justify-center",
          shapeCls,
          previewClassName,
        )}
      >
        {value ? (
          <>
            <img src={value} alt="" decoding="async" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setUrl("");
              }}
              className="absolute top-2 right-2 size-7 rounded-full bg-background/90 border border-border flex items-center justify-center hover:bg-background"
              aria-label="Quitar imagen"
            >
              <X className="size-3.5" />
            </button>
          </>
        ) : (
          <div className="text-muted-foreground text-xs flex flex-col items-center gap-1">
            <ImageIcon className="size-6 opacity-50" />
            <span>Sin imagen</span>
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
      >
        {uploading ? (
          <>
            <Loader2 className="size-4 mr-2 animate-spin" />
            Subiendo…
          </>
        ) : (
          <>
            <Upload className="size-4 mr-2" />
            Subir desde mi computadora
          </>
        )}
      </Button>

      <div className="flex gap-2">
        <Input
          placeholder="O pega una URL https://…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            if (url.trim()) onChange(url.trim());
          }}
          disabled={!url.trim() || url.trim() === value}
        >
          Usar
        </Button>
      </div>

      {templates.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-2">O elige una plantilla</p>
          <div className="grid grid-cols-4 gap-2">
            {templates.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  onChange(t);
                  setUrl(t);
                }}
                className={cn(
                  "relative overflow-hidden border transition-all",
                  shape === "circle" ? "rounded-full aspect-square" : "rounded-md aspect-square",
                  value === t
                    ? "border-primary ring-2 ring-primary/30"
                    : "border-border hover:border-primary/60",
                )}
              >
                <img
                  src={t}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export const LOCATION_TEMPLATES = [
  "https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?w=400&h=400&fit=crop",
  "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=400&h=400&fit=crop",
  "https://images.unsplash.com/photo-1600948836101-f9ffda59d250?w=400&h=400&fit=crop",
  "https://images.unsplash.com/photo-1622286342621-4bd786c2447c?w=400&h=400&fit=crop",
  "https://images.unsplash.com/photo-1582095133179-bfd08e2fc6b3?w=400&h=400&fit=crop",
  "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=400&h=400&fit=crop",
  "https://images.unsplash.com/photo-1470259078422-826894b933aa?w=400&h=400&fit=crop",
  "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=400&h=400&fit=crop",
];

export const PRO_TEMPLATES = [
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=300&h=300&fit=crop",
  "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=300&h=300&fit=crop",
  "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=300&h=300&fit=crop",
  "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=300&h=300&fit=crop",
  "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=300&h=300&fit=crop",
  "https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=300&h=300&fit=crop",
  "https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=300&h=300&fit=crop",
  "https://images.unsplash.com/photo-1607746882042-944635dfe10e?w=300&h=300&fit=crop",
];
