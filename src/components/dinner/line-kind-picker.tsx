import { useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowDown01Icon, Tick02Icon } from "@hugeicons/core-free-icons"

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

export type LineKind = "item" | "modifier" | "fee" | "tax" | "tip" | "ignore"

export const LINE_KIND_LABEL: Record<LineKind, string> = {
  item: "Item",
  modifier: "Part of the line above",
  fee: "Fee",
  tax: "Tax",
  tip: "Tip",
  ignore: "Not on the bill",
}

const LINE_KIND_HINT: Record<LineKind, string> = {
  item: "Food or drink someone had",
  modifier: "An extra that belongs to the dish above",
  fee: "Service or another charge, split by share",
  tax: "Printed tax, split by share",
  tip: "The printed tip, split by share",
  ignore: "Leave it out of the split",
}

export function LineKindPicker({
  lineName,
  amount,
  current,
  options,
  lowConfidence = false,
  onPick,
}: {
  lineName: string
  amount: string
  current: LineKind
  options: LineKind[]
  lowConfidence?: boolean
  onPick: (kind: LineKind) => void
}) {
  const [open, setOpen] = useState(false)
  const label = LINE_KIND_LABEL[current]

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`What is ${lineName}? ${label}`}
        onClick={() => setOpen(true)}
        className="-ml-1 inline-flex min-h-9 items-center gap-0.5 rounded-md px-1 text-[13px] text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className={cn(lowConfidence && "text-destructive")}>
          {lowConfidence ? `${label} · check this one` : label}
        </span>
        <HugeiconsIcon icon={ArrowDown01Icon} size={14} strokeWidth={2} />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="rounded-t-3xl bg-background p-0"
        >
          <div className="mx-auto w-full max-w-content pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]">
            <div
              aria-hidden
              className="mx-auto mt-2 h-1 w-9 rounded-full bg-border"
            />
            <SheetHeader className="gap-0.5 px-4 pt-3 pb-3 text-left">
              <SheetTitle className="eyebrow">What is this line?</SheetTitle>
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0 truncate font-display text-xl font-bold tracking-tight">
                  {lineName}
                </p>
                <p className="shrink-0 font-display text-xl font-bold tabular-nums">
                  {amount}
                </p>
              </div>
              <SheetDescription className="text-[13px]">
                Only items get assigned to people. Charges split by share.
              </SheetDescription>
            </SheetHeader>
            <div
              role="radiogroup"
              aria-label={`What is ${lineName}?`}
              className="group-list mx-4"
            >
              {options.map((option) => {
                const checked = option === current
                return (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    onClick={() => {
                      setOpen(false)
                      if (!checked) onPick(option)
                    }}
                    className="group-row-hit w-full text-left"
                  >
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block text-[15px]",
                          checked && "font-semibold",
                          option === "ignore" && "text-destructive"
                        )}
                      >
                        {LINE_KIND_LABEL[option]}
                      </span>
                      <span className="block text-[13px] text-muted-foreground">
                        {LINE_KIND_HINT[option]}
                      </span>
                    </span>
                    {checked ? (
                      <HugeiconsIcon
                        icon={Tick02Icon}
                        size={18}
                        strokeWidth={2.2}
                        className="shrink-0 text-primary"
                      />
                    ) : null}
                  </button>
                )
              })}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
