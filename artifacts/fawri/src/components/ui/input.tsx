import * as React from "react"

import {
  normalizeDecimalTextInput,
  placeholderForDisplay,
  valueForKnownDateTimeInputAuthority,
  valueForKnownDateTimeInputDisplay,
} from "@/lib/dateTimeInputMask"
import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, onChange, placeholder, value, inputMode, ...props }, ref) => {
    const displayedPlaceholder = placeholderForDisplay(placeholder)
    const displayedValue = typeof value === "string"
      ? valueForKnownDateTimeInputDisplay(value, placeholder)
      : value

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const rawValue = inputMode === "decimal"
        ? normalizeDecimalTextInput(event.currentTarget.value)
        : event.currentTarget.value
      const authorityValue = valueForKnownDateTimeInputAuthority(
        rawValue,
        placeholder,
      )
      if (authorityValue !== event.currentTarget.value) {
        event.currentTarget.value = authorityValue
      }
      onChange?.(event)
    }

    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        ref={ref}
        placeholder={displayedPlaceholder}
        value={displayedValue}
        inputMode={inputMode}
        onChange={handleChange}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
