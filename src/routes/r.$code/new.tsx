import { useMemo, useState } from "react"
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowLeft01Icon, Camera01Icon } from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { recallMember } from "@/lib/member-storage"
import {
  equalSplitCents,
  formatMoney,
  parseAmountToCents,
} from "@/lib/settle"
import { scanReceipt } from "@/server/ocr"
import { addExpense, getRoomByCode } from "@/server/rooms"

export const Route = createFileRoute("/r/$code/new")({
  loader: async ({ params }) => {
    const room = await getRoomByCode({ data: { code: params.code } })
    if (!room) throw new Error("Room not found")
    return { room }
  },
  component: AddExpensePage,
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

function AddExpensePage() {
  const { room } = Route.useLoaderData()
  const navigate = useNavigate()
  const remembered = recallMember(room.code)

  const [title, setTitle] = useState("")
  const [amountRaw, setAmountRaw] = useState("")
  const [paidById, setPaidById] = useState(
    remembered && room.members.some((m) => m.id === remembered)
      ? remembered
      : (room.members[0]?.id ?? "")
  )
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(room.members.map((m) => m.id))
  )
  const [customMode, setCustomMode] = useState(false)
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [ocrPending, setOcrPending] = useState(false)

  const amountCents = useMemo(() => parseAmountToCents(amountRaw), [amountRaw])

  function toggleMember(memberId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(memberId)) {
        if (next.size === 1) return prev
        next.delete(memberId)
      } else {
        next.add(memberId)
      }
      return next
    })
  }

  async function onScan(file: File | null) {
    if (!file) return
    setError(null)

    if (!file.type.startsWith("image/")) {
      setError("Pick an image file (JPEG, PNG, or WebP)")
      return
    }
    if (file.size > 1_000_000) {
      setError("Image is too large (max 1MB). Try a clearer crop.")
      return
    }

    setOcrPending(true)
    try {
      const buffer = await file.arrayBuffer()
      const bytes = new Uint8Array(buffer)
      let binary = ""
      const chunk = 0x8000
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
      }
      const imageBase64 = btoa(binary)
      const draft = await scanReceipt({
        data: {
          code: room.code,
          imageBase64,
          mimeType: file.type || "image/jpeg",
        },
      })
      if (draft.title) setTitle(draft.title)
      if (draft.amountCents) {
        setAmountRaw((draft.amountCents / 100).toFixed(2))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "OCR failed")
    } finally {
      setOcrPending(false)
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    if (amountCents === null || amountCents <= 0) {
      setError("Enter a valid amount")
      return
    }
    if (!title.trim()) {
      setError("Add a short title")
      return
    }
    if (!paidById) {
      setError("Pick who paid")
      return
    }

    const shareMemberIds = [...selected]
    let customShares:
      | Array<{ memberId: string; amountCents: number }>
      | undefined

    if (customMode) {
      customShares = shareMemberIds.map((memberId) => {
        const parsed = parseAmountToCents(customAmounts[memberId] ?? "0")
        return { memberId, amountCents: parsed ?? 0 }
      })
      const sum = customShares.reduce((total, share) => total + share.amountCents, 0)
      if (sum !== amountCents) {
        setError(
          `Custom shares sum to ${formatMoney(sum, room.currency)}, need ${formatMoney(amountCents, room.currency)}`
        )
        return
      }
    }

    setPending(true)
    try {
      await addExpense({
        data: {
          code: room.code,
          title: title.trim(),
          amountCents,
          paidById,
          shareMemberIds,
          customShares,
        },
      })
      await navigate({ to: "/r/$code", params: { code: room.code } })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save expense")
    } finally {
      setPending(false)
    }
  }

  const previewShares = useMemo(() => {
    if (amountCents === null || amountCents <= 0 || selected.size === 0) {
      return []
    }
    return equalSplitCents(amountCents, [...selected])
  }, [amountCents, selected])

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

      <h1 className="font-display mt-4 text-3xl font-semibold tracking-tight">
        Add expense
      </h1>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Label htmlFor="amount">Amount</Label>
          <Input
            id="amount"
            inputMode="decimal"
            value={amountRaw}
            onChange={(e) => setAmountRaw(e.target.value)}
            placeholder="0.00"
            required
            className="font-display h-16 text-4xl tracking-tight"
          />
          <p className="text-muted-foreground text-xs">{room.currency}</p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Dinner, taxi, Airbnb…"
            required
            className="h-11"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label>Scan ticket (optional)</Label>
          <label className="border-border hover:bg-muted/40 flex h-11 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed text-sm">
            <HugeiconsIcon icon={Camera01Icon} size={18} strokeWidth={2} />
            {ocrPending ? "Reading…" : "Scan receipt"}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              disabled={ocrPending}
              onChange={(e) => void onScan(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="paid-by">Paid by</Label>
          <Select
            value={paidById}
            onValueChange={(value) => {
              if (value) setPaidById(value)
            }}
          >
            <SelectTrigger id="paid-by" className="h-11 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {room.members.map((member) => (
                <SelectItem key={member.id} value={member.id}>
                  {member.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <Label>Split between</Label>
            <button
              type="button"
              className="text-primary text-xs font-medium"
              onClick={() => setCustomMode((value) => !value)}
            >
              {customMode ? "Use equal split" : "Custom amounts"}
            </button>
          </div>
          <ul className="space-y-2">
            {room.members.map((member) => {
              const checked = selected.has(member.id)
              const equal = previewShares.find((s) => s.memberId === member.id)
              return (
                <li
                  key={member.id}
                  className="flex items-center justify-between gap-3 py-1"
                >
                  <label className="flex items-center gap-3 text-sm">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleMember(member.id)}
                    />
                    {member.name}
                  </label>
                  {checked && customMode ? (
                    <Input
                      inputMode="decimal"
                      value={customAmounts[member.id] ?? ""}
                      onChange={(e) =>
                        setCustomAmounts((prev) => ({
                          ...prev,
                          [member.id]: e.target.value,
                        }))
                      }
                      placeholder="0.00"
                      className="h-9 w-28 text-right"
                    />
                  ) : checked && equal ? (
                    <span className="text-muted-foreground text-sm">
                      {formatMoney(equal.amountCents, room.currency)}
                    </span>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </div>

        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}

        <Button
          type="submit"
          size="lg"
          disabled={pending}
          className="h-12 text-base"
        >
          {pending ? "Saving…" : "Save expense"}
        </Button>
      </form>
    </main>
  )
}
