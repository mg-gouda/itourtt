"use client"

import * as React from "react"
import * as LabelPrimitive from "@radix-ui/react-label"

import { cn } from "@/lib/utils"

const CONTROL =
  'input:not([type="hidden"]), select, textarea, button[role="combobox"], [role="combobox"], [role="switch"], [role="checkbox"], [role="radiogroup"], [contenteditable="true"]'
const LABELABLE = new Set(["INPUT", "SELECT", "TEXTAREA", "BUTTON"])

/**
 * UI review 4c: most forms put a <Label> next to its field without htmlFor, so screen readers
 * read a field by its value ("ORANGE-BAY") instead of its name. A Label without htmlFor (and
 * without a field inside it) now links itself to the first field that follows it in the same
 * container — <label for> for real inputs / buttons, aria-labelledby for custom widgets.
 * An explicit htmlFor always wins.
 */
function useAutoAssociate(ref: React.RefObject<HTMLLabelElement | null>, explicit: boolean) {
  const autoId = React.useId()
  React.useEffect(() => {
    const label = ref.current
    if (!label || explicit || label.htmlFor || label.querySelector(CONTROL)) return
    const parent = label.parentElement
    if (!parent) return
    let control: HTMLElement | null = null
    for (const el of Array.from(parent.querySelectorAll<HTMLElement>(CONTROL))) {
      // The first field after the label, in document order.
      if (label.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) {
        control = el
        break
      }
    }
    if (!control) return
    const safe = autoId.replace(/[^a-zA-Z0-9_-]/g, "")
    if (!control.id) control.id = `fld${safe}`
    if (LABELABLE.has(control.tagName)) {
      label.htmlFor = control.id
    } else if (!control.getAttribute("aria-labelledby") && !control.getAttribute("aria-label")) {
      if (!label.id) label.id = `lbl${safe}`
      control.setAttribute("aria-labelledby", label.id)
    }
  })
}

function Label({
  className,
  htmlFor,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  const ref = React.useRef<HTMLLabelElement | null>(null)
  useAutoAssociate(ref, !!htmlFor)
  return (
    <LabelPrimitive.Root
      ref={ref}
      data-slot="label"
      htmlFor={htmlFor}
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Label }
