import {
  HeadContent,
  Link,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router"
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools"
import { TanStackDevtools } from "@tanstack/react-devtools"

import appCss from "../styles.css?url"

const SITE_TITLE = "Split — trip costs, no accounts"
const SITE_DESCRIPTION =
  "Split trip costs with a room code. No accounts, no fuss."

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, viewport-fit=cover",
      },
      { title: SITE_TITLE },
      { name: "description", content: SITE_DESCRIPTION },
      { name: "theme-color", content: "#0f766e" },
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
        That room or page doesn&rsquo;t exist.
      </p>
      <Link
        to="/"
        className="bg-primary text-primary-foreground mt-8 inline-flex h-11 w-fit items-center rounded-md px-5 text-sm font-medium"
      >
        Back to Split
      </Link>
    </main>
  ),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
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
