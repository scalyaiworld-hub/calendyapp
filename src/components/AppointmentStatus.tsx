import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { STATUS_LABELS, statusOptions, type ApptStatus } from "@/lib/appointments";

/** Select de estado que solo ofrece las transiciones válidas para la cita. */
export function StatusSelect({
  status,
  startsAt,
  onChange,
}: {
  status: string;
  startsAt: string;
  onChange: (next: ApptStatus) => void;
}) {
  const options = statusOptions(status, startsAt);
  return (
    <Select
      value={status}
      onValueChange={(v) => onChange(v as ApptStatus)}
      disabled={options.length <= 1}
    >
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((s) => (
          <SelectItem key={s} value={s}>
            {STATUS_LABELS[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function CancelReasonDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string | undefined) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setReason("");
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancelar cita</DialogTitle>
          <DialogDescription>
            La cancelación no se puede deshacer. Puedes indicar el motivo (opcional).
          </DialogDescription>
        </DialogHeader>
        <div>
          <Label>Motivo</Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={300}
            placeholder="Ej. El cliente avisó que no puede asistir"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Volver
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              onConfirm(reason.trim() || undefined);
              setReason("");
            }}
          >
            Cancelar cita
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type StatusChange = { id: string; status: ApptStatus; reason?: string };

/**
 * Centraliza los cambios de estado: cancelar pasa por el diálogo de motivo,
 * el resto se aplica directamente.
 */
export function useStatusChange(apply: (v: StatusChange) => void): {
  request: (id: string, status: ApptStatus) => void;
  dialog: ReactNode;
} {
  const [cancelId, setCancelId] = useState<string | null>(null);
  const request = (id: string, status: ApptStatus) => {
    if (status === "cancelled") setCancelId(id);
    else apply({ id, status });
  };
  const dialog = (
    <CancelReasonDialog
      open={!!cancelId}
      onOpenChange={(o) => {
        if (!o) setCancelId(null);
      }}
      onConfirm={(reason) => {
        if (cancelId) apply({ id: cancelId, status: "cancelled", reason });
        setCancelId(null);
      }}
    />
  );
  return { request, dialog };
}
