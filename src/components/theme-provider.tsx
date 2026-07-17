import * as React from "react"

export type Theme = "light" | "dark" | "system"
type ResolvedTheme = "light" | "dark"

type ThemeContextValue = {
  theme: Theme
  resolvedTheme: ResolvedTheme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null)

const STORAGE_KEY = "split-theme"
const THEME_ORDER = ["light", "dark", "system"] as const satisfies readonly Theme[]

function isTheme(value: string | null): value is Theme {
  return value === "light" || value === "dark" || value === "system"
}

function systemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light"
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light"
}

function applyTheme(resolved: ResolvedTheme) {
  if (typeof document === "undefined") return
  const root = document.documentElement
  root.classList.toggle("dark", resolved === "dark")
  root.style.colorScheme = resolved
}

export function ThemeProvider({
  children,
  storageKey = STORAGE_KEY,
}: {
  children: React.ReactNode
  storageKey?: string
}) {
  const [theme, setThemeState] = React.useState<Theme>("system")
  const [resolvedTheme, setResolvedTheme] =
    React.useState<ResolvedTheme>("light")

  // Read persisted preference after mount to avoid SSR hydration mismatch.
  React.useEffect(() => {
    const stored = window.localStorage.getItem(storageKey)
    setThemeState(isTheme(stored) ? stored : "system")
  }, [storageKey])

  React.useEffect(() => {
    const resolved = theme === "system" ? systemTheme() : theme
    setResolvedTheme(resolved)
    applyTheme(resolved)

    if (theme !== "system") return
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = () => {
      const sys = media.matches ? "dark" : "light"
      setResolvedTheme(sys)
      applyTheme(sys)
    }
    media.addEventListener("change", onChange)
    return () => media.removeEventListener("change", onChange)
  }, [theme])

  const setTheme = React.useCallback(
    (next: Theme) => {
      setThemeState(next)
      window.localStorage.setItem(storageKey, next)
    },
    [storageKey]
  )

  const toggleTheme = React.useCallback(() => {
    const index = THEME_ORDER.indexOf(theme)
    const next = THEME_ORDER[(index + 1) % THEME_ORDER.length] ?? "system"
    setTheme(next)
  }, [theme, setTheme])

  const value = React.useMemo(
    () => ({ theme, resolvedTheme, setTheme, toggleTheme }),
    [theme, resolvedTheme, setTheme, toggleTheme]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = React.useContext(ThemeContext)
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider")
  }
  return context
}
