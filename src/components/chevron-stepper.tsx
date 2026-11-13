import type { ReactNode } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons"

export function ChevronStepper({
  label,
  prevLabel,
  nextLabel,
  onPrev,
  onNext,
  prevDisabled,
  nextDisabled,
  children,
}: {
  label: string
  prevLabel: string
  nextLabel: string
  onPrev: () => void
  onNext: () => void
  prevDisabled?: boolean
  nextDisabled?: boolean
  children: ReactNode
}) {
  return (
    <div
      className="flex items-center justify-between gap-2"
      role="group"
      aria-label={label}
    >
      <button
        type="button"
        className="icon-hit size-11"
        aria-label={prevLabel}
        disabled={prevDisabled}
        onClick={onPrev}
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} size={18} strokeWidth={2} />
      </button>
      {children}
      <button
        type="button"
        className="icon-hit size-11"
        aria-label={nextLabel}
        disabled={nextDisabled}
        onClick={onNext}
      >
        <HugeiconsIcon icon={ArrowRight01Icon} size={18} strokeWidth={2} />
      </button>
    </div>
  )
}
