import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COUNTRIES, DEFAULT_COUNTRY_CODE } from "@/lib/countries";

interface PhoneInputProps {
  countryCode: string;
  number: string;
  onCountryCodeChange: (code: string) => void;
  onNumberChange: (n: string) => void;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
}

export function PhoneInput({
  countryCode,
  number,
  onCountryCodeChange,
  onNumberChange,
  placeholder = "999 999 999",
  id,
  disabled,
}: PhoneInputProps) {
  return (
    <div className="flex gap-2">
      <Select
        value={countryCode || DEFAULT_COUNTRY_CODE}
        onValueChange={onCountryCodeChange}
        disabled={disabled}
      >
        <SelectTrigger className="w-32 shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          {COUNTRIES.map((c) => (
            <SelectItem key={c.iso} value={c.code}>
              <span className="mr-2">{c.flag}</span>
              <span className="font-mono text-xs">{c.code}</span>
              <span className="text-muted-foreground ml-2 text-xs">{c.name}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        id={id}
        type="tel"
        inputMode="numeric"
        value={number}
        onChange={(e) => onNumberChange(e.target.value.replace(/[^\d\s-]/g, ""))}
        placeholder={placeholder}
        disabled={disabled}
        className="flex-1"
      />
    </div>
  );
}

export function formatPhone(
  countryCode: string | null | undefined,
  number: string | null | undefined,
): string {
  if (!number) return "";
  return `${countryCode || ""} ${number}`.trim();
}
