import { ClerkProvider } from "@clerk/tanstack-react-start"
import { shadcn } from "@clerk/ui/themes"
import {
  HeadContent,
  Link,
  Scripts,
  createRootRouteWithContext,
} from "@tanstack/react-router"
import type { QueryClient } from "@tanstack/react-query"
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools"
import { TanStackDevtools } from "@tanstack/react-devtools"

import { AuthModal } from "@/components/auth-modal"
import { SiteNotice } from "@/components/site-notice"
import { PwaInstallPrompt } from "@/components/pwa-install-prompt"
import { PwaUpdatePrompt } from "@/components/pwa-update-prompt"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { clerkUiEnabled } from "@/lib/clerk-ui"
import { fetchAuthState } from "@/server/auth"
import appCss from "../styles.css?url"

// Applies the persisted theme before paint to avoid a flash / hydration jump.
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('split-theme');var d=t==='dark'||((!t||t==='system')&&window.matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.classList.toggle('dark',d);r.style.colorScheme=d?'dark':'light';}catch(e){}})();`

const SITE_ORIGIN = "https://split.ailabs.sv"
const SITE_TITLE = "Split — bills and trips"
const SITE_DESCRIPTION =
  "Scan a ticket, tap who had what. Join with a code. Keep yours when you sign in."
const OG_IMAGE = `${SITE_ORIGIN}/og-image.png`
const OG_ALT = "Split — scan a ticket, tap who had what"

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient
  userId: string | null
}>()({
  beforeLoad: async () => {
    try {
      return await fetchAuthState()
    } catch {
      return { userId: null }
    }
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, viewport-fit=cover",
      },
      { title: SITE_TITLE },
      { name: "description", content: SITE_DESCRIPTION },
      {
        name: "theme-color",
        content: "#f5f4f8",
        media: "(prefers-color-scheme: light)",
      },
      {
        name: "theme-color",
        content: "#16131f",
        media: "(prefers-color-scheme: dark)",
      },
      { name: "page-type", content: "software" },
      { name: "site-kind", content: "software" },
      { name: "application-name", content: "Split" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "Split" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Split" },
      { property: "og:url", content: `${SITE_ORIGIN}/` },
      { property: "og:title", content: SITE_TITLE },
      { property: "og:description", content: SITE_DESCRIPTION },
      { property: "og:image", content: OG_IMAGE },
      { property: "og:image:type", content: "image/png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: OG_ALT },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: SITE_TITLE },
      { name: "twitter:description", content: SITE_DESCRIPTION },
      { name: "twitter:image", content: OG_IMAGE },
      { name: "twitter:image:alt", content: OG_ALT },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "icon", href: "/favicon.ico", sizes: "32x32" },
      {
        rel: "apple-touch-icon",
        href: `${SITE_ORIGIN}/apple-touch-icon.png`,
        sizes: "180x180",
      },
    ],
  }),
  notFoundComponent: () => (
    <main className="page-gutter mx-auto flex min-h-dvh max-w-content flex-col justify-center">
      <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        404
      </p>
      <h1 className="mt-3 font-display text-[34px] leading-tight font-bold tracking-tight text-foreground">
        Page not found
      </h1>
      <p className="mt-1 text-[15px] text-muted-foreground">
        That trip or page doesn&rsquo;t exist.
      </p>
      <Link to="/" search={{ stay: true }} className="split-cta mt-8 w-fit">
        Back to Split
      </Link>
    </main>
  ),
  shellComponent: RootDocument,
})

function AppProviders({ children }: { children: React.ReactNode }) {
  if (!clerkUiEnabled()) return children
  return (
    <ClerkProvider appearance={{ theme: shadcn }}>{children}</ClerkProvider>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-type="software"
      data-radius="round"
      data-buttons="pill"
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <HeadContent />
      </head>
      <body>
        <ThemeProvider>
          <AppProviders>
            {children}
            <Toaster />
            <SiteNotice />
            <AuthModal />
            <PwaInstallPrompt />
            <PwaUpdatePrompt />
          </AppProviders>
        </ThemeProvider>
        {import.meta.env.DEV && import.meta.env.VITE_E2E !== "1" ? (
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
