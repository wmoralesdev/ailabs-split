import { useMutationState, useQueryClient } from "@tanstack/react-query"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Alert02Icon,
  CloudOffIcon,
  CloudSyncIcon,
  Loading03Icon,
} from "@hugeicons/core-free-icons"
import { toast } from "sonner"

import { ADD_EXPENSE_MUTATION_KEY } from "@/lib/add-expense-mutation"
import { useOnlineStatus } from "@/lib/online-status"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/** Room-header cue for offline / pending expense sync (quiet when idle). */
export function SyncStatus({ className }: { className?: string }) {
  const isOnline = useOnlineStatus()
  const queryClient = useQueryClient()

  const pendingMutations = useMutationState({
    filters: { mutationKey: ADD_EXPENSE_MUTATION_KEY, status: "pending" },
  })
  const errorMutations = useMutationState({
    filters: { mutationKey: ADD_EXPENSE_MUTATION_KEY, status: "error" },
  })

  const pendingCount = pendingMutations.length
  const errorCount = errorMutations.length
  const isSyncing = pendingMutations.some((mutation) => !mutation.isPaused)

  if (isOnline && pendingCount === 0 && errorCount === 0) {
    return null
  }

  function retryFailed() {
    void queryClient.resumePausedMutations()
    for (const mutation of queryClient
      .getMutationCache()
      .findAll({ mutationKey: ADD_EXPENSE_MUTATION_KEY })) {
      if (mutation.state.status === "error") {
        void mutation.execute(mutation.state.variables)
      }
    }
    toast.message("Retrying sync…")
  }

  if (errorCount > 0 && isOnline) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn("text-destructive relative", className)}
        aria-label={`Sync failed for ${errorCount} expense${errorCount === 1 ? "" : "s"}. Tap to retry.`}
        title="Sync failed — tap to retry"
        onClick={retryFailed}
      >
        <HugeiconsIcon icon={Alert02Icon} size={18} strokeWidth={2} />
        <span className="bg-destructive text-destructive-foreground absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full text-[10px] font-semibold">
          {errorCount}
        </span>
      </Button>
    )
  }

  if (!isOnline) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn("text-muted-foreground relative", className)}
        aria-label={
          pendingCount > 0
            ? `Offline. ${pendingCount} expense${pendingCount === 1 ? "" : "s"} waiting to sync.`
            : "Offline"
        }
        title={
          pendingCount > 0
            ? `Offline · ${pendingCount} waiting`
            : "Offline"
        }
      >
        <HugeiconsIcon icon={CloudOffIcon} size={18} strokeWidth={2} />
        {pendingCount > 0 ? (
          <span className="bg-muted-foreground text-background absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full text-[10px] font-semibold">
            {pendingCount}
          </span>
        ) : null}
      </Button>
    )
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn("text-muted-foreground relative", className)}
      aria-label={`Syncing ${pendingCount} expense${pendingCount === 1 ? "" : "s"}`}
      title={`Syncing ${pendingCount}`}
      onClick={() => void queryClient.resumePausedMutations()}
    >
      <HugeiconsIcon
        icon={isSyncing ? Loading03Icon : CloudSyncIcon}
        size={18}
        strokeWidth={2}
        className={isSyncing ? "animate-spin" : undefined}
      />
      <span className="bg-primary text-primary-foreground absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full text-[10px] font-semibold">
        {pendingCount}
      </span>
    </Button>
  )
}
