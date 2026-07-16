import { useMemo, useState } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { z } from "zod"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  Camera01Icon,
  MinusSignIcon,
} from "@hugeicons/core-free-icons"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  atmDigitsFromInput,
  atmDigitsToCents,
  centsToAtmDigits,
  currencyFractionDigits,
  formatAtmAmount,
} from "@/lib/atm-amount"
import { compressImageForOcr } from "@/lib/compress-image"
import {
  rememberLastCurrency,
  resolveLastCurrency,
} from "@/lib/last-currency"
import { recallMember } from "@/lib/member-storage"
import { CURRENCY_OPTIONS } from "@/lib/room-code"
import { roomKeys, roomQueryOptions } from "@/lib/room-query"
import {
  equalSplitCents,
  formatMoney,
  partsSplitCents,
} from "@/lib/settle"
import type { SplitMode } from "@/lib/schemas"
import { scanReceipt } from "@/server/ocr"
import { addExpense } from "@/server/rooms"
import type { RoomDto } from "@/server/rooms"

export const Route = createFileRoute("/r/$code/new")({
  loader: async ({ params, context }) => {
    const room = await context.queryClient.ensureQueryData(
      roomQueryOptions(params.code)
    )
    if (!room) throw new Error("Trip not found")
  },
  component: AddExpensePage,
})

function currencyLabel(code: string): string {
  return CURRENCY_OPTIONS.find((option) => option.code === code)?.label ?? code
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("")
}

const formSchema = z
  .object({
    title: z.string().trim().min(1, "Add a short title").max(80, "Title is too long"),
    /** ATM digit buffer (minor units), not a decimal string. */
    amount: z.string(),
    currency: z.string().min(3),
    paidById: z.string().min(1, "Pick who paid"),
  })
  .superRefine((data, ctx) => {
    const cents = atmDigitsToCents(
      data.amount,
      currencyFractionDigits(data.currency)
    )
    if (cents <= 0) {
      ctx.addIssue({
        code: "custom",
        path: ["amount"],
        message: "Enter a valid amount",
      })
    }
  })

type FormValues = z.infer<typeof formSchema>

type AddExpensePayload = {
  code: string
  title: string
  amountCents: number
  currency?: string
  paidById: string
  splitMode: SplitMode
  splits: Array<{ memberId: string; weight?: number; amountCents?: number }>
}

function AddExpensePage() {
  const { code } = Route.useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: room } = useQuery(roomQueryOptions(code))

  if (!room) return null
  return <AddExpenseForm room={room} code={code} navigate={navigate} queryClient={queryClient} />
}

function AddExpenseForm({
  room,
  code,
  navigate,
  queryClient,
}: {
  room: RoomDto
  code: string
  navigate: ReturnType<typeof useNavigate>
  queryClient: ReturnType<typeof useQueryClient>
}) {
  const remembered = recallMember(room.code)
  const defaultPaidBy =
    remembered && room.members.some((m) => m.id === remembered)
      ? remembered
      : (room.members[0]?.id ?? "")
  const defaultCurrency = resolveLastCurrency(
    room.code,
    room.currencies,
    room.currency
  )

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      amount: "",
      currency: defaultCurrency,
      paidById: defaultPaidBy,
    },
  })

  const [splitMode, setSplitMode] = useState<SplitMode>("EQUAL")
  const [included, setIncluded] = useState<Set<string>>(
    () => new Set(room.members.map((m) => m.id))
  )
  const [weights, setWeights] = useState<Record<string, number>>(() =>
    Object.fromEntries(room.members.map((m) => [m.id, 1]))
  )
  /** Per-member ATM digit buffers when split mode is AMOUNT. */
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [splitError, setSplitError] = useState<string | null>(null)
  const [ocrPending, setOcrPending] = useState(false)

  const amountDigits = form.watch("amount")
  const currency = form.watch("currency")
  const fractionDigits = useMemo(
    () => currencyFractionDigits(currency),
    [currency]
  )
  const amountCents = useMemo(
    () => atmDigitsToCents(amountDigits, fractionDigits),
    [amountDigits, fractionDigits]
  )

  const activeMemberIds = useMemo(() => {
    if (splitMode === "PARTS") {
      return room.members
        .filter((m) => (weights[m.id] ?? 0) > 0)
        .map((m) => m.id)
    }
    return room.members.filter((m) => included.has(m.id)).map((m) => m.id)
  }, [splitMode, room.members, weights, included])

  const preview = useMemo<Record<string, number>>(() => {
    if (amountCents <= 0) return {}
    if (splitMode === "EQUAL") {
      if (activeMemberIds.length === 0) return {}
      return Object.fromEntries(
        equalSplitCents(amountCents, activeMemberIds).map((s) => [
          s.memberId,
          s.amountCents,
        ])
      )
    }
    if (splitMode === "PARTS") {
      const positive = room.members
        .filter((m) => (weights[m.id] ?? 0) > 0)
        .map((m) => ({ memberId: m.id, weight: weights[m.id] ?? 0 }))
      if (positive.length === 0) return {}
      return Object.fromEntries(
        partsSplitCents(amountCents, positive).map((s) => [
          s.memberId,
          s.amountCents,
        ])
      )
    }
    return Object.fromEntries(
      activeMemberIds.map((id) => [
        id,
        atmDigitsToCents(amounts[id] ?? "", fractionDigits),
      ])
    )
  }, [
    amountCents,
    splitMode,
    activeMemberIds,
    weights,
    amounts,
    room.members,
    fractionDigits,
  ])

  const assignedCents = useMemo(
    () => Object.values(preview).reduce((sum, cents) => sum + cents, 0),
    [preview]
  )
  const remainingCents = amountCents - assignedCents

  const mutation = useMutation({
    mutationFn: (input: AddExpensePayload) => addExpense({ data: input }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: roomKeys.detail(code) })
      toast.success("Expense added")
      await navigate({ to: "/r/$code", params: { code } })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not save expense")
    },
  })

  function toggleMember(memberId: string) {
    setSplitError(null)
    setIncluded((prev) => {
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

  function setWeight(memberId: string, next: number) {
    setSplitError(null)
    setWeights((prev) => ({ ...prev, [memberId]: Math.max(0, next) }))
  }

  async function onScan(file: File | null) {
    if (!file) return
    setOcrPending(true)
    try {
      const compressed = await compressImageForOcr(file)
      const draft = await scanReceipt({
        data: {
          code: room.code,
          imageBase64: compressed.base64,
          mimeType: compressed.mimeType,
        },
      })
      if (draft.title) form.setValue("title", draft.title, { shouldValidate: true })
      if (draft.amountCents) {
        form.setValue(
          "amount",
          centsToAtmDigits(
            draft.amountCents,
            currencyFractionDigits(form.getValues("currency"))
          ),
          { shouldValidate: true }
        )
      }
      toast.success("Receipt scanned")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not read receipt")
    } finally {
      setOcrPending(false)
    }
  }

  function onSubmit(values: FormValues) {
    setSplitError(null)
    const fd = currencyFractionDigits(values.currency)
    const cents = atmDigitsToCents(values.amount, fd)
    if (cents <= 0) {
      form.setError("amount", { message: "Enter a valid amount" })
      return
    }

    let splits: Array<{ memberId: string; weight?: number; amountCents?: number }>

    if (splitMode === "PARTS") {
      const positive = room.members
        .filter((m) => (weights[m.id] ?? 0) > 0)
        .map((m) => ({ memberId: m.id, weight: weights[m.id] ?? 0 }))
      if (positive.length === 0) {
        setSplitError("Give at least one person some parts")
        return
      }
      splits = positive
    } else if (splitMode === "AMOUNT") {
      const ids = [...included]
      if (ids.length === 0) {
        setSplitError("Pick at least one person")
        return
      }
      splits = ids.map((memberId) => ({
        memberId,
        amountCents: atmDigitsToCents(amounts[memberId] ?? "", fd),
      }))
      const sum = splits.reduce((total, s) => total + (s.amountCents ?? 0), 0)
      if (sum !== cents) {
        setSplitError(
          `Amounts add up to ${formatMoney(sum, values.currency)}, need ${formatMoney(cents, values.currency)}`
        )
        return
      }
    } else {
      const ids = [...included]
      if (ids.length === 0) {
        setSplitError("Pick at least one person")
        return
      }
      splits = ids.map((memberId) => ({ memberId }))
    }

    rememberLastCurrency(room.code, values.currency)

    mutation.mutate({
      code: room.code,
      title: values.title.trim(),
      amountCents: cents,
      currency: values.currency,
      paidById: values.paidById,
      splitMode,
      splits,
    })
  }

  const currencyItems = room.currencies.map((c) => ({
    label: currencyLabel(c),
    value: c,
  }))
  const memberItems = room.members.map((m) => ({ label: m.name, value: m.id }))

  return (
    <main className="page-gutter mx-auto max-w-content pt-6">
      <h1 className="font-display text-3xl font-semibold tracking-tight">
        Add expense
      </h1>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="mt-6 flex flex-col gap-6"
        >
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount</FormLabel>
                  <FormControl>
                    <Input
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder={formatAtmAmount("", fractionDigits)}
                      size="lg"
                      className="text-right tabular-nums"
                      name={field.name}
                      ref={field.ref}
                      onBlur={field.onBlur}
                      value={formatAtmAmount(field.value, fractionDigits)}
                      onChange={(e) => {
                        field.onChange(atmDigitsFromInput(e.target.value))
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="currency"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Currency</FormLabel>
                  <FormControl>
                    <Select
                      items={currencyItems}
                      value={field.value}
                      onValueChange={(value) => {
                        if (!value) return
                        field.onChange(value)
                        rememberLastCurrency(room.code, value)
                      }}
                    >
                      <SelectTrigger size="lg" className="min-w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {room.currencies.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormControl>
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Title</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Dinner, taxi, Airbnb…"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex flex-col gap-2">
            <FormLabelStatic>Scan ticket (optional)</FormLabelStatic>
            <label className="border-border hover:bg-muted/40 flex h-12 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed text-sm">
              <HugeiconsIcon icon={Camera01Icon} size={18} strokeWidth={2} />
              {ocrPending ? "Reading receipt…" : "Scan receipt"}
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

          <FormField
            control={form.control}
            name="paidById"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Paid by</FormLabel>
                <FormControl>
                  <Select
                    items={memberItems}
                    value={field.value}
                    onValueChange={(value) => value && field.onChange(value)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Who paid?" />
                    </SelectTrigger>
                    <SelectContent>
                      {room.members.map((member) => (
                        <SelectItem key={member.id} value={member.id}>
                          {member.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <FormLabelStatic>Split between</FormLabelStatic>
              <Tabs
                value={splitMode}
                onValueChange={(value) => {
                  setSplitMode(value as SplitMode)
                  setSplitError(null)
                }}
              >
                <TabsList className="h-9">
                  <TabsTrigger value="EQUAL" className="text-xs">
                    Equal
                  </TabsTrigger>
                  <TabsTrigger value="PARTS" className="text-xs">
                    Parts
                  </TabsTrigger>
                  <TabsTrigger value="AMOUNT" className="text-xs">
                    Amounts
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <ul className="divide-border/60 divide-y">
              {room.members.map((member) => {
                const isParts = splitMode === "PARTS"
                const weight = weights[member.id] ?? 0
                const active = isParts ? weight > 0 : included.has(member.id)
                const shareCents = preview[member.id] ?? 0
                return (
                  <li
                    key={member.id}
                    className="flex items-center justify-between gap-3 py-2.5"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        isParts
                          ? setWeight(member.id, weight > 0 ? 0 : 1)
                          : toggleMember(member.id)
                      }
                      className="flex min-w-0 items-center gap-3 text-left"
                    >
                      <Avatar
                        className={
                          active
                            ? "size-9"
                            : "size-9 opacity-40 grayscale"
                        }
                      >
                        <AvatarFallback className="bg-accent text-accent-foreground text-xs font-semibold">
                          {initials(member.name)}
                        </AvatarFallback>
                      </Avatar>
                      <span
                        className={
                          active
                            ? "truncate font-medium"
                            : "text-muted-foreground truncate"
                        }
                      >
                        {member.name}
                      </span>
                    </button>

                    {isParts ? (
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="size-8 rounded-full"
                          onClick={() => setWeight(member.id, weight - 1)}
                          disabled={weight <= 0}
                          aria-label={`Fewer parts for ${member.name}`}
                        >
                          <HugeiconsIcon icon={MinusSignIcon} size={14} strokeWidth={2} />
                        </Button>
                        <span className="w-5 text-center text-sm font-semibold tabular-nums">
                          {weight}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="size-8 rounded-full"
                          onClick={() => setWeight(member.id, weight + 1)}
                          aria-label={`More parts for ${member.name}`}
                        >
                          <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={2} />
                        </Button>
                        <span className="text-muted-foreground w-16 text-right text-xs tabular-nums">
                          {formatMoney(active ? shareCents : 0, currency)}
                        </span>
                      </div>
                    ) : splitMode === "AMOUNT" ? (
                      active ? (
                        <Input
                          inputMode="numeric"
                          autoComplete="off"
                          value={formatAtmAmount(
                            amounts[member.id] ?? "",
                            fractionDigits
                          )}
                          onChange={(e) => {
                            setSplitError(null)
                            setAmounts((prev) => ({
                              ...prev,
                              [member.id]: atmDigitsFromInput(e.target.value),
                            }))
                          }}
                          placeholder={formatAtmAmount("", fractionDigits)}
                          size="sm"
                          className="w-28 text-right tabular-nums"
                        />
                      ) : (
                        <span className="text-muted-foreground text-sm">
                          Not included
                        </span>
                      )
                    ) : active ? (
                      <span className="text-sm font-medium tabular-nums">
                        {formatMoney(shareCents, currency)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-sm">
                        Not included
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>

            <div className="text-muted-foreground flex items-center justify-between text-xs">
              <span>
                {activeMemberIds.length} of {room.members.length} people
              </span>
              {splitMode === "AMOUNT" && amountCents > 0 ? (
                <span
                  className={
                    remainingCents === 0
                      ? "text-primary font-medium"
                      : "text-destructive font-medium"
                  }
                >
                  {remainingCents === 0
                    ? "Balanced"
                    : remainingCents > 0
                      ? `${formatMoney(remainingCents, currency)} left`
                      : `${formatMoney(-remainingCents, currency)} over`}
                </span>
              ) : amountCents > 0 ? (
                <span>{formatMoney(assignedCents, currency)} split</span>
              ) : null}
            </div>

            {splitError ? (
              <p className="text-destructive text-xs" role="alert">
                {splitError}
              </p>
            ) : null}
          </div>

          <Button
            type="submit"
            size="lg"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "Saving…" : "Save expense"}
          </Button>
        </form>
      </Form>
    </main>
  )
}

function FormLabelStatic({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-foreground flex items-center gap-2 text-sm leading-none font-medium">
      {children}
    </span>
  )
}
