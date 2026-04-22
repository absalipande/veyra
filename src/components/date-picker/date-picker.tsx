"use client"

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { Calendar } from "@/components/ui/calendar"
import { format } from "date-fns"
import { CalendarIcon } from "lucide-react"
import * as React from "react"

type DatePickerFieldProps = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  size?: "default" | "compact"
  displayFormat?: string
}

function parseDateInputValue(value: string) {
  const raw = value.trim()
  if (!raw) return null

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (isoMatch) {
    const year = Number(isoMatch[1])
    const month = Number(isoMatch[2])
    const day = Number(isoMatch[3])
    const date = new Date(year, month - 1, day)
    if (
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day
    ) {
      return date
    }
  }

  const slashMatch = raw.match(/^(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})$/)
  if (slashMatch) {
    const month = Number(slashMatch[1])
    const day = Number(slashMatch[2])
    const year = Number(slashMatch[3])
    const date = new Date(year, month - 1, day)
    if (
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day
    ) {
      return date
    }
  }

  const fallback = new Date(raw)
  if (!Number.isFinite(fallback.getTime())) return null
  return fallback
}

export function DatePickerField({
  value,
  onChange,
  placeholder = "Pick a date",
  className,
  size = "default",
  displayFormat = "MM / dd / yyyy",
}: DatePickerFieldProps) {
  const date = parseDateInputValue(value)
  const baseClassName =
    size === "compact"
      ? "inline-flex h-9 w-full items-center justify-between rounded-[0.75rem] border border-border/80 bg-white px-3 text-left text-[0.88rem] leading-none font-normal text-foreground shadow-none outline-none transition-colors hover:bg-white focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
      : "inline-flex h-10 w-full items-center justify-between rounded-[1rem] border border-border/80 bg-white px-3 text-left text-sm leading-none font-normal text-foreground shadow-none outline-none transition-colors hover:bg-white focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 sm:h-11 sm:px-4 sm:text-[0.98rem]"

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            baseClassName,
            !date && "text-muted-foreground",
            className
          )}
        >
          <span className="leading-none">{date ? format(date, displayFormat) : placeholder}</span>
          <CalendarIcon className="h-4 w-4 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date ?? undefined}
          onSelect={(nextDate) => onChange(nextDate ? format(nextDate, "yyyy-MM-dd") : "")}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  )
}

export default DatePickerField
