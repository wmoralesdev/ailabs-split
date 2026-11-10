import { Toaster as Sonner  } from "sonner"
import type {ToasterProps} from "sonner";
import { HugeiconsIcon } from "@hugeicons/react"
import { CheckmarkCircle02Icon, InformationCircleIcon, Alert02Icon, MultiplicationSignCircleIcon, Loading03Icon } from "@hugeicons/core-free-icons"

import { useTheme } from "@/components/theme-provider"

const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme } = useTheme()

  return (
    <Sonner
      theme={resolvedTheme}
      position="top-center"
      className="toaster group"
      offset={12}
      mobileOffset={{ top: 10, left: 12, right: 12 }}
      gap={8}
      icons={{
        success: (
          <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={2.2} className="size-4" />
        ),
        info: (
          <HugeiconsIcon icon={InformationCircleIcon} strokeWidth={2.2} className="size-4" />
        ),
        warning: (
          <HugeiconsIcon icon={Alert02Icon} strokeWidth={2.2} className="size-4" />
        ),
        error: (
          <HugeiconsIcon icon={MultiplicationSignCircleIcon} strokeWidth={2.2} className="size-4" />
        ),
        loading: (
          <HugeiconsIcon icon={Loading03Icon} strokeWidth={2.2} className="size-4 animate-spin" />
        ),
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "split-toast group/toast flex w-full font-sans items-center gap-3 rounded-[22px] py-2.5 pr-2.5 pl-3 text-popover-foreground",
          icon: "flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground group-data-[type=error]/toast:bg-destructive group-data-[type=warning]/toast:bg-destructive group-data-[type=info]/toast:bg-foreground group-data-[type=info]/toast:text-background group-data-[type=loading]/toast:bg-muted group-data-[type=loading]/toast:text-foreground",
          content: "min-w-0 flex-1",
          title: "text-[15px] leading-tight font-semibold",
          description: "mt-0.5 truncate text-[13px] leading-snug text-muted-foreground",
          actionButton:
            "inline-flex h-8 shrink-0 items-center rounded-full bg-muted px-3.5 text-[13px] font-semibold text-primary transition-colors hover:bg-foreground/10 active:scale-[0.97]",
          cancelButton:
            "inline-flex h-8 shrink-0 items-center rounded-full px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
