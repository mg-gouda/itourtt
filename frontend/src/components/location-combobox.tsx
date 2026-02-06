"use client";

import { useState, useEffect, useCallback } from "react";
import { Check, ChevronsUpDown, MapPin, Plane, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import api from "@/lib/api";

interface LocationResult {
  id: string;
  type: "AIRPORT" | "ZONE" | "HOTEL";
  name: string;
  code?: string;
  path: string;
}

interface LocationComboboxProps {
  value: string;
  onChange: (id: string, type: string, name?: string) => void;
  types?: string[];
  placeholder?: string;
  disabled?: boolean;
}

const typeIcons: Record<string, React.ElementType> = {
  AIRPORT: Plane,
  ZONE: MapPin,
  HOTEL: Building2,
};

const typeColors: Record<string, string> = {
  AIRPORT: "bg-blue-500/20 text-blue-600 border-blue-500/30",
  ZONE: "bg-emerald-500/20 text-emerald-600 border-emerald-500/30",
  HOTEL: "bg-amber-500/20 text-amber-600 border-amber-500/30",
};

export function LocationCombobox({
  value,
  onChange,
  types,
  placeholder = "Select location...",
  disabled = false,
}: LocationComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LocationResult[]>([]);
  const [selected, setSelected] = useState<LocationResult | null>(null);
  const [loading, setLoading] = useState(false);

  const searchLocations = useCallback(
    async (q: string) => {
      setLoading(true);
      try {
        const params: Record<string, string> = {};
        if (q) params.q = q;
        if (types?.length) params.types = types.join(",");
        const { data } = await api.get("/locations/search", { params });
        setResults(Array.isArray(data) ? data : data.data || []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [types]
  );

  // Load initial results when popover opens
  useEffect(() => {
    if (open) {
      searchLocations(query);
    }
  }, [open, searchLocations]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced search
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      searchLocations(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, open, searchLocations]);

  // Resolve selected value on mount
  useEffect(() => {
    if (value && !selected) {
      searchLocations("").then(() => {
        // Try to find in results
      });
    }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update selected when results change and we have a value
  useEffect(() => {
    if (value && results.length > 0) {
      const found = results.find((r) => r.id === value);
      if (found) setSelected(found);
    }
  }, [value, results]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between border-border bg-card text-foreground font-normal",
            !selected && "text-muted-foreground"
          )}
        >
          {selected ? (
            <span className="flex items-center gap-2 truncate">
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px] px-1 py-0",
                  typeColors[selected.type]
                )}
              >
                {selected.type}
              </Badge>
              <span className="truncate">{selected.name}</span>
            </span>
          ) : (
            placeholder
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[350px] p-0 border-border bg-popover" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search locations..."
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>
              {loading ? "Searching..." : "No locations found."}
            </CommandEmpty>
            <CommandGroup>
              {results.map((loc) => {
                const Icon = typeIcons[loc.type] || MapPin;
                return (
                  <CommandItem
                    key={`${loc.type}-${loc.id}`}
                    value={`${loc.type}-${loc.id}`}
                    onSelect={() => {
                      setSelected(loc);
                      onChange(loc.id, loc.type, loc.name);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === loc.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <Icon className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="flex flex-col min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-medium">
                          {loc.name}
                          {loc.code && (
                            <span className="ml-1 text-muted-foreground">
                              ({loc.code})
                            </span>
                          )}
                        </span>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] px-1 py-0 shrink-0",
                            typeColors[loc.type]
                          )}
                        >
                          {loc.type}
                        </Badge>
                      </span>
                      <span className="text-xs text-muted-foreground truncate">
                        {loc.path}
                      </span>
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
