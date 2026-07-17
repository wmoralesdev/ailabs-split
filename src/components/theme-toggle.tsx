import { HugeiconsIcon } from "@hugeicons/react"
import {
  ComputerIcon,
  Moon02Icon,
  Sun01Icon,
} from "@hugeicons/core-free-icons"

import { useTheme, type Theme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"

const THEME_ICON = {
  light: Sun01Icon,
  dark: Moon02Icon,
  system: ComputerIcon,
} as const

const THEME_LABEL: Record<Theme, string> = {
  light: "Theme: light. Switch to dark",
  dark: "Theme: dark. Switch to system",
  system: "Theme: system. Switch to light",
}

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme()

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-lg"
      onClick={toggleTheme}
      aria-label={THEME_LABEL[theme]}
      title={THEME_LABEL[theme]}
      className={className}
    >
      <HugeiconsIcon icon={THEME_ICON[theme]} size={18} strokeWidth={2} />
    </Button>
  )
}
