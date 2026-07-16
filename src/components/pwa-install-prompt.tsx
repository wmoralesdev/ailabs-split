import { useEffect, useState } from "react"
import { useRouterState } from "@tanstack/react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Cancel01Icon,
  Download01Icon,
  Share01Icon,
} from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  dismissInstallPrompt,
  isInstallDismissed,
  isIosDevice,
  isStandaloneDisplay,
} from "@/lib/pwa-install"
import type { BeforeInstallPromptEvent } from "@/lib/pwa-install"

function PwaInstallPrompt() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const onLanding = pathname === "/"

  const [visible, setVisible] = useState(false)
  const [iosHelpOpen, setIosHelpOpen] = useState(false)
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null
  )
  const [ios, setIos] = useState(false)

  useEffect(() => {
    if (isStandaloneDisplay() || isInstallDismissed()) return

    setIos(isIosDevice())

    const onBeforeInstall = (event: Event) => {
      event.preventDefault()
      setDeferred(event as BeforeInstallPromptEvent)
      setVisible(true)
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstall)

    // iOS never fires beforeinstallprompt — show a soft prompt after a beat.
    const timer = window.setTimeout(() => {
      if (isIosDevice()) setVisible(true)
    }, 1800)

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall)
      window.clearTimeout(timer)
    }
  }, [])

  function dismiss() {
    dismissInstallPrompt()
    setVisible(false)
    setIosHelpOpen(false)
  }

  async function installAndroid() {
    if (!deferred) return
    await deferred.prompt()
    const choice = await deferred.userChoice
    setDeferred(null)
    if (choice.outcome === "accepted") {
      setVisible(false)
    } else {
      dismiss()
    }
  }

  // Listen app-wide; only show the banner on landing so it doesn't cover room FAB.
  if (!visible || !onLanding) return null

  return (
    <>
      <div className="animate-rise pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="border-border bg-background/95 shadow-float pointer-events-auto flex w-full max-w-content items-start gap-3 rounded-xl border p-4 backdrop-blur-md">
          <div className="bg-muted text-primary flex size-10 shrink-0 items-center justify-center rounded-lg">
            <HugeiconsIcon icon={Download01Icon} size={20} strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-base font-semibold tracking-tight">
              Install Split
            </p>
            <p className="text-muted-foreground mt-0.5 text-sm leading-snug">
              {ios
                ? "Add it to your Home Screen for quick access on this phone."
                : "Install the app for a faster, full-screen experience."}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {ios ? (
                <Button
                  type="button"
                  size="sm"
                  className="h-8 px-3"
                  onClick={() => setIosHelpOpen(true)}
                >
                  How to add
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  className="h-8 px-3"
                  disabled={!deferred}
                  onClick={() => void installAndroid()}
                >
                  Install
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 px-3"
                onClick={dismiss}
              >
                Not now
              </Button>
            </div>
          </div>
          <button
            type="button"
            aria-label="Dismiss install prompt"
            className="text-muted-foreground hover:text-foreground -mt-1 -mr-1 rounded-md p-1"
            onClick={dismiss}
          >
            <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={2} />
          </button>
        </div>
      </div>

      <Dialog open={iosHelpOpen} onOpenChange={setIosHelpOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Split on iPhone</DialogTitle>
            <DialogDescription>
              Safari doesn&rsquo;t show an install button — use Share instead.
            </DialogDescription>
          </DialogHeader>
          <ol className="text-foreground mt-2 list-decimal space-y-3 pl-5 text-sm leading-relaxed">
            <li>
              Tap{" "}
              <span className="inline-flex items-center gap-1 font-medium">
                Share
                <HugeiconsIcon icon={Share01Icon} size={14} strokeWidth={2} />
              </span>{" "}
              at the bottom of Safari.
            </li>
            <li>
              Scroll and tap{" "}
              <span className="font-medium">Add to Home Screen</span>.
            </li>
            <li>
              Tap <span className="font-medium">Add</span>. Split opens like an
              app.
            </li>
          </ol>
          <Button type="button" className="mt-4 w-full" onClick={dismiss}>
            Got it
          </Button>
        </DialogContent>
      </Dialog>
    </>
  )
}

export { PwaInstallPrompt }
