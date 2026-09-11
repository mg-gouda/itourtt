"use client";

import { Check, ChevronsUpDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

export interface MultiSelectItem {
  value: string;
  label: string;
  sub?: string;
}

interface Props {
  items: MultiSelectItem[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  /** Hides the search box for short, fixed lists such as the party options. */
  searchable?: boolean;
}

/**
 * A combobox that keeps several answers. The chosen items stay visible as
 * removable chips on the trigger, because the whole point of a multi-select is
 * seeing what is already ticked without opening it.
 *
 * Order is the order they were picked — the first entry is the primary one
 * wherever the backend still stores a single value beside the set.
 */
export function MultiSelect({
  items,
  value,
  onChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "Nothing found.",
  disabled,
  className,
  searchable = true,
}: Props) {
  const toggle = (val: string) =>
    onChange(value.includes(val) ? value.filter((v) => v !== val) : [...value, val]);

  const selected = value
    .map((v) => items.find((i) => i.value === v))
    .filter((i): i is MultiSelectItem => Boolean(i));

  return (
    <Popover>
      <PopoverTrigger asChild disabled={disabled}>
        <Button
          variant="outline"
          role="combobox"
          className={cn(
            "h-auto min-h-9 w-full justify-between px-3 py-1.5 font-normal",
            className,
          )}
        >
          <span className="flex flex-wrap items-center gap-1 text-left">
            {selected.length === 0 ? (
              <span className="text-muted-foreground">{placeholder}</span>
            ) : (
              selected.map((item) => (
                <Badge
                  key={item.value}
                  variant="secondary"
                  className="gap-1 font-normal"
                  onClick={(e) => {
                    // Removing a chip must not also open the list.
                    e.preventDefault();
                    e.stopPropagation();
                    toggle(item.value);
                  }}
                >
                  {item.label}
                  <X className="h-3 w-3 opacity-60" />
                </Badge>
              ))
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
      >
        <Command>
          {searchable && <CommandInput placeholder={searchPlaceholder} />}
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {items.map((item) => (
                <CommandItem
                  key={item.value}
                  value={`${item.label} ${item.sub ?? ""}`}
                  onSelect={() => toggle(item.value)}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value.includes(item.value) ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="flex flex-col">
                    <span>{item.label}</span>
                    {item.sub && (
                      <span className="text-xs text-muted-foreground">{item.sub}</span>
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
