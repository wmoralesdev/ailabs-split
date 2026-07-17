import { useEffect } from "react"
import { useRegisterSW } from "virtual:pwa-register/react"
import { toast } from "sonner"

const UPDATE_TOAST_ID = "pwa-update-available"

/**
 * Shows a persistent toast when a new service worker is waiting.
 * Reload activates the update (registerType: "prompt").
 */
export function PwaUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  useEffect(() => {
    if (!needRefresh) return

    toast.message("Update available", {
      id: UPDATE_TOAST_ID,
      description: "Reload to get the latest version.",
      duration: Infinity,
      action: {
        label: "Reload",
        onClick: () => {
          void updateServiceWorker(true)
        },
      },
      onDismiss: () => {
        setNeedRefresh(false)
      },
    })

    return () => {
      toast.dismiss(UPDATE_TOAST_ID)
    }
  }, [needRefresh, setNeedRefresh, updateServiceWorker])

  return null
}
