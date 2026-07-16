import { useMemo, useState } from "react"
import { Link, createFileRoute } from "@tanstack/react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowLeft01Icon, Copy01Icon } from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import {
  computeNets,
  formatTransferSentence,
  simplifyTransfers,
} from "@/lib/settle"
import { getRoomByCode } from "@/server/rooms"

export const Route = createFileRoute("/r/$code/settle")({
  loader: async ({ params }) => {
    const room = await getRoomByCode({ data: { code: params.code } })
    if (!room) throw new Error("Room not found")
    return { room }
  },
  component: SettlePage,
  errorComponent: ({ error }) => (
    <main className="page-gutter mx-auto flex min-h-dvh max-w-content flex-col justify-center">
      <h1 className="font-display text-3xl font-semibold">Room not found</h1>
      <p className="text-muted-foreground mt-2">{error.message}</p>
      <Link to="/" className="text-primary mt-6 underline">
        Back to Split
      </Link>
    </main>
  ),
})

function SettlePage() {
  const { room } = Route.useLoaderData()
  const [copied, setCopied] = useState(false)

  const transfers = useMemo(() => {
    const nets = computeNets(
      room.members,
      room.expenses.map((expense) => ({
        paidById: expense.paidById,
        shares: expense.shares.map((share) => ({
          memberId: share.memberId,
          amountCents: share.amountCents,
        })),
      }))
    )
    return simplifyTransfers(nets)
  }, [room])

  const sentences = transfers.map((transfer) =>
    formatTransferSentence(transfer, room.currency)
  )

  async function copyAll() {
    if (sentences.length === 0) return
    await navigator.clipboard.writeText(sentences.join("\n"))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <main className="page-gutter mx-auto min-h-dvh max-w-content pb-16 pt-6">
      <Link
        to="/r/$code"
        params={{ code: room.code }}
        className="text-muted-foreground inline-flex items-center gap-1 text-sm"
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} size={16} strokeWidth={2} />
        {room.name}
      </Link>

      <div className="mt-4 flex items-end justify-between gap-3">
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Settle up
        </h1>
        {sentences.length > 0 ? (
          <Button type="button" variant="outline" size="sm" onClick={() => void copyAll()}>
            <HugeiconsIcon icon={Copy01Icon} size={14} strokeWidth={2} />
            {copied ? "Copied" : "Copy"}
          </Button>
        ) : null}
      </div>

      {sentences.length === 0 ? (
        <p className="text-muted-foreground mt-10 text-lg">
          {room.expenses.length === 0
            ? "No expenses yet — nothing to settle."
            : "Everyone is even. Nice."}
        </p>
      ) : (
        <ul className="mt-10 space-y-5">
          {sentences.map((sentence) => (
            <li
              key={sentence}
              className="font-display text-foreground text-2xl leading-snug font-medium tracking-tight sm:text-3xl"
            >
              {sentence}
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
