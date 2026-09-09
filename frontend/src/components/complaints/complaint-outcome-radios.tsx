"use client";

import { Button } from "@/components/ui/button";
import { type ComplaintOutcome, OUTCOME_LABELS } from "@/lib/complaints";

interface Props {
  value: "" | ComplaintOutcome | null;
  onChange: (value: ComplaintOutcome) => void;
  /** Omitted when the caller has nowhere to put an undecided complaint. */
  onClear?: () => void;
  disabled?: boolean;
  /**
   * Radio inputs are grouped by name across the whole document, so each dialog
   * passes its own or the two would fight over the same selection.
   */
  name: string;
}

/**
 * Won / Lost. Shared by the complaint form and the detail view so both offer the
 * same choice — and so "Lost" means the same thing in both: money is owed.
 */
export function ComplaintOutcomeRadios({
  value,
  onChange,
  onClear,
  disabled,
  name,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
      {(Object.keys(OUTCOME_LABELS) as ComplaintOutcome[]).map((option) => (
        <label
          key={option}
          className={`flex items-center gap-2 text-sm ${
            disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
          }`}
        >
          <input
            type="radio"
            name={name}
            value={option}
            checked={value === option}
            onChange={() => onChange(option)}
            disabled={disabled}
            className="h-4 w-4 accent-primary"
          />
          {OUTCOME_LABELS[option]}
        </label>
      ))}

      {value && onClear && !disabled && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={onClear}
        >
          Not decided yet
        </Button>
      )}
    </div>
  );
}
