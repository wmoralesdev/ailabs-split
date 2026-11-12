import { cn } from "@/lib/utils"

const MARK_DARK = "/brand/ailabs-iso-dark.svg"
const MARK_LIGHT = "/brand/ailabs-iso-light.svg"

/**
 * Official Ai Labs lockup: brand isotype + live Plus Jakarta Sans wordmark.
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
        className="inline-flex items-baseline gap-[0.28em] font-display text-[16px] leading-none font-extrabold tracking-[-0.03em]"
      >
        <span className="text-[#8B7BC7]">Ai</span>
        <span className="text-[#303030] dark:text-[#EDEDED]">Labs</span>
      </span>
    </span>
  )
}
