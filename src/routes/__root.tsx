import {
  HeadContent,
  Link,
  Scripts,
  createRootRouteWithContext,
} from "@tanstack/react-router"
import type { QueryClient } from "@tanstack/react-query"
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools"
import { TanStackDevtools } from "@tanstack/react-devtools"

import { PwaInstallPrompt } from "@/components/pwa-install-prompt"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import appCss from "../styles.css?url"

// Applies the persisted theme before paint to avoid a flash / hydration jump.
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('split-theme');var d=t==='dark'||((!t||t==='system')&&window.matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.classList.toggle('dark',d);r.style.colorScheme=d?'dark':'light';}catch(e){}})();`

const SITE_TITLE = "Split — trip costs, no accounts"
const SITE_DESCRIPTION =
  "Split trip costs with a trip code. No accounts, no fuss."

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, viewport-fit=cover",
      },
      { title: SITE_TITLE },
      { name: "description", content: SITE_DESCRIPTION },
      { name: "theme-color", content: "#1a1a1a" },
      { name: "application-name", content: "Split" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "Split" },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Split" },
      { property: "og:title", content: SITE_TITLE },
      { property: "og:description", content: SITE_DESCRIPTION },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: SITE_TITLE },
      { name: "twitter:description", content: SITE_DESCRIPTION },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png" },
    ],
  }),
  notFoundComponent: () => (
    <main className="page-gutter mx-auto flex min-h-dvh max-w-content flex-col justify-center">
      <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
        404
      </p>
      <h1 className="font-display text-foreground mt-3 text-4xl font-semibold tracking-tight">
        Page not found
      </h1>
      <p className="text-muted-foreground mt-3 text-lg">
        That trip or page doesn&rsquo;t exist.
      </p>
      <Link
        to="/"
        search={{ stay: true }}
        className="bg-primary text-primary-foreground mt-8 inline-flex h-(--control-height) w-fit items-center rounded-md px-5 text-base font-medium"
      >
        Back to Split
      </Link>
    </main>
  ),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <HeadContent />
      </head>
      <body>
        <ThemeProvider>
          {children}
          <Toaster />
          <PwaInstallPrompt />
        </ThemeProvider>
        {import.meta.env.DEV ? (
          <TanStackDevtools
            config={{ position: "bottom-right" }}
            plugins={[
              {
                name: "Tanstack Router",
                render: <TanStackRouterDevtoolsPanel />,
              },
            ]}
          />
        ) : null}
        <Scripts />
      </body>
    </html>
  )
}
