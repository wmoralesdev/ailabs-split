import { HugeiconsIcon } from "@hugeicons/react"
import { Moon02Icon, Sun01Icon } from "@hugeicons/core-free-icons"

import { useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, toggleTheme } = useTheme()
  const isDark = resolvedTheme === "dark"

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-lg"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={className}
    >
      <HugeiconsIcon
        icon={isDark ? Sun01Icon : Moon02Icon}
        size={18}
        strokeWidth={2}
      />
    </Button>
  )
}
