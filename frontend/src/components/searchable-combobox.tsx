"use client";

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
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
import { cn } from "@/lib/utils";

export interface ComboboxItem {
  value: string;
  label: string;
  sub?: string;
}

interface Props {
  items: ComboboxItem[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  triggerClassName?: string;
  /**
   * Fires as the user types. Supply it when the options come from the server:
   * client-side filtering is then turned off, so results the server returned
   * are shown as-is instead of being filtered a second time against the raw
   * query (which hides matches found on fields the label doesn't show).
   */
  onSearchChange?: (term: string) => void;
  /** Shown in place of the empty text while a server search is running. */
  loading?: boolean;
}

export function SearchableCombobox({
  items,
  value,
  onChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "No results.",
  triggerClassName,
  onSearchChange,
  loading = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const serverSearch = typeof onSearchChange === "function";
  const selected = items.find((i) => i.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between font-normal", triggerClassName)}
        >
          <span className="truncate text-left">
            {selected ? (
              <>
                {selected.label}
                {selected.sub && (
                  <span className="text-muted-foreground ml-1 text-xs">({selected.sub})</span>
                )}
              </>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={!serverSearch}>
          <CommandInput
            placeholder={searchPlaceholder}
            onValueChange={onSearchChange}
          />
          <CommandList>
            <CommandEmpty>{loading ? "Searching…" : emptyText}</CommandEmpty>
            <CommandGroup>
              {items.map((item) => (
                <CommandItem
                  key={item.value}
                  value={`${item.label} ${item.sub ?? ""}`}
                  onSelect={() => { onChange(item.value); setOpen(false); }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === item.value ? "opacity-100" : "opacity-0")} />
                  <span className="flex-1">
                    {item.label}
                    {item.sub && (
                      <span className="text-muted-foreground ml-1 text-xs">({item.sub})</span>
                    )}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
