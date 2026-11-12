import { cn } from "@/lib/utils"

const MARK_DARK = "/brand/ailabs-iso-dark.svg"
const MARK_LIGHT = "/brand/ailabs-iso-light.svg"

/**
 * Official Ai Labs lockup: brand isotype + live Plus Jakarta Sans Medium 500.
 * Inks match public/brand/ailabs-dark.svg (Ai #8B7BC7, Labs #303030).
 */
export function SiteLogo({ className }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="Ai Labs"
      className={cn("inline-flex shrink-0 items-center gap-2", className)}
    >
      <img
        src={MARK_DARK}
        alt=""
        width={278}
        height={324}
        draggable={false}
        className="h-6 w-auto dark:hidden"
      />
      <img
        src={MARK_LIGHT}
        alt=""
        width={278}
        height={324}
        draggable={false}
        className="hidden h-6 w-auto dark:block"
      />
      <span
        aria-hidden="true"
        className="ailabs-wordmark inline-flex items-baseline gap-[0.28em]"
      >
        <span className="font-medium text-[#8B7BC7]">Ai</span>
        <span className="font-medium text-[#303030] dark:text-[#EDEDED]">
          Labs
        </span>
      </span>
    </span>
  )
}
