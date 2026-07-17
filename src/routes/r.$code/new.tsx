import { useEffect, useMemo, useState } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { onlineManager, useMutation, useQuery } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { z } from "zod"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  ArrowLeft01Icon,
  Camera01Icon,
  MinusSignIcon,
} from "@hugeicons/core-free-icons"

import { CategoryChips } from "@/components/category-chips"
import { MemberPicker } from "@/components/member-picker"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ADD_EXPENSE_MUTATION_KEY } from "@/lib/add-expense-mutation"
import type { AddExpenseMutationVars } from "@/lib/add-expense-mutation"
import {
  atmDigitsFromInput,
  atmDigitsToCents,
  centsToAtmDigits,
  currencyFractionDigits,
  formatAtmAmount,
  formatAtmAmountInput,
} from "@/lib/atm-amount"
import { compressImageForOcr } from "@/lib/compress-image"
import { rememberLastCurrency, resolveLastCurrency } from "@/lib/last-currency"
import { useOnlineStatus } from "@/lib/online-status"
import { useRoomIdentity } from "@/lib/room-identity"
import { CURRENCY_OPTIONS } from "@/lib/room-code"
import { roomQueryOptions } from "@/lib/room-query"
import { redistributeAmounts } from "@/lib/amount-split"
import { equalSplitCents, formatMoney, partsSplitCents } from "@/lib/settle"
import type { SplitMode } from "@/lib/schemas"
import { scanReceipt } from "@/server/ocr"
import type { ExpenseDto, RoomDto } from "@/server/rooms"

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
    title: z
      .string()
      .trim()
      .min(1, "Add a short title")
      .max(80, "Title is too long"),
    category: z.string().trim().max(32, "Category is too long").optional(),
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

function AddExpenseSkeleton() {
  return (
    <main className="page-gutter mx-auto max-w-content pt-6">
      <Skeleton className="h-8 w-40" />
      <div className="mt-6 space-y-4">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    </main>
  )
}

function AddExpensePage() {
  const { code } = Route.useParams()
  const navigate = useNavigate()
  const { memberId } = useRoomIdentity()
  const { data: room, isPending } = useQuery(roomQueryOptions(code, memberId))

  if (!room) {
    return isPending ? <AddExpenseSkeleton /> : null
  }
  return (
    <AddExpenseForm
      room={room}
      code={code}
      selfMemberId={memberId}
      navigate={navigate}
    />
  )
}

function AddExpenseForm({
  room,
  code,
  selfMemberId,
  navigate,
}: {
  room: RoomDto
  code: string
  selfMemberId: string
  navigate: ReturnType<typeof useNavigate>
}) {
  const defaultPaidBy = room.members.some((m) => m.id === selfMemberId)
    ? selfMemberId
    : (room.members[0]?.id ?? "")
  const defaultCurrency = resolveLastCurrency(
    room.code,
    room.currencies,
    room.currency
  )

  const isOnline = useOnlineStatus()

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      category: "",
      amount: "",
      currency: defaultCurrency,
      paidById: defaultPaidBy,
    },
  })

  const [isPersonal, setIsPersonal] = useState(false)
  const [splitMode, setSplitMode] = useState<SplitMode>("EQUAL")
  const [included, setIncluded] = useState<Set<string>>(
    () => new Set(room.members.map((m) => m.id))
  )
  const [weights, setWeights] = useState<Record<string, number>>(() =>
    Object.fromEntries(room.members.map((m) => [m.id, 1]))
  )
  /** Per-member ATM digit buffers when split mode is AMOUNT. */
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  /** Members whose Amounts fields were edited by the user (locked). */
  const [manualIds, setManualIds] = useState<Set<string>>(() => new Set())
  const [splitError, setSplitError] = useState<string | null>(null)
  const [ocrPending, setOcrPending] = useState(false)

  function setPersonalMode(next: boolean) {
    setIsPersonal(next)
    setSplitError(null)
    if (next) {
      form.setValue("paidById", selfMemberId, { shouldValidate: true })
      setSplitMode("EQUAL")
      setIncluded(new Set([selfMemberId]))
      setWeights(
        Object.fromEntries(
          room.members.map((m) => [m.id, m.id === selfMemberId ? 1 : 0])
        )
      )
      return
    }
    setIncluded(new Set(room.members.map((m) => m.id)))
    setWeights(Object.fromEntries(room.members.map((m) => [m.id, 1])))
  }

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
    if (isPersonal) return [selfMemberId]
    if (splitMode === "PARTS") {
      return room.members
        .filter((m) => (weights[m.id] ?? 0) > 0)
        .map((m) => m.id)
    }
    return room.members.filter((m) => included.has(m.id)).map((m) => m.id)
  }, [isPersonal, selfMemberId, splitMode, room.members, weights, included])

  // Seed / redistribute Amounts: manuals stay; unlocked share the remainder.
  useEffect(() => {
    if (splitMode !== "AMOUNT" || isPersonal) return

    const includedIds = room.members
      .filter((m) => included.has(m.id))
      .map((m) => m.id)

    setManualIds((prevManual) => {
      const cleaned = new Set(
        [...prevManual].filter((id) => includedIds.includes(id))
      )

      setAmounts((prevAmounts) => {
        const next = redistributeAmounts({
          totalCents: amountCents,
          includedIds,
          manualIds: cleaned,
          amounts: prevAmounts,
          fractionDigits,
        })
        const prevKeys = Object.keys(prevAmounts)
        const nextKeys = Object.keys(next)
        if (
          prevKeys.length === nextKeys.length &&
          nextKeys.every((key) => prevAmounts[key] === next[key])
        ) {
          return prevAmounts
        }
        return next
      })

      if (
        cleaned.size === prevManual.size &&
        [...cleaned].every((id) => prevManual.has(id))
      ) {
        return prevManual
      }
      return cleaned
    })
  }, [
    splitMode,
    isPersonal,
    amountCents,
    fractionDigits,
    included,
    room.members,
  ])

  const preview = useMemo<Record<string, number>>(() => {
    if (amountCents <= 0) return {}
    if (isPersonal) {
      return { [selfMemberId]: amountCents }
    }
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
    isPersonal,
    selfMemberId,
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

  const mutation = useMutation<ExpenseDto, Error, AddExpenseMutationVars>({
    mutationKey: ADD_EXPENSE_MUTATION_KEY,
    onSuccess: async () => {
      toast.success("Expense added")
      await navigate({ to: "/r/$code", params: { code } })
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Could not save expense"
      )
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
    setManualIds((prev) => {
      if (!prev.has(memberId)) return prev
      const next = new Set(prev)
      next.delete(memberId)
      return next
    })
  }

  function onAmountShareChange(memberId: string, digits: string) {
    setSplitError(null)
    const nextManual = new Set(manualIds)
    nextManual.add(memberId)
    setManualIds(nextManual)

    const includedIds = room.members
      .filter((m) => included.has(m.id))
      .map((m) => m.id)

    setAmounts((prev) =>
      redistributeAmounts({
        totalCents: amountCents,
        includedIds,
        manualIds: nextManual,
        amounts: { ...prev, [memberId]: digits },
        fractionDigits,
      })
    )
  }

  function onSplitModeChange(value: string) {
    const mode = value as SplitMode
    setSplitMode(mode)
    setSplitError(null)
    if (mode === "AMOUNT") {
      setManualIds(new Set())
    }
  }

  function setWeight(memberId: string, next: number) {
    setSplitError(null)
    setWeights((prev) => ({ ...prev, [memberId]: Math.max(0, next) }))
  }

  async function onScan(file: File | null) {
    if (!file) return
    if (!onlineManager.isOnline()) {
      toast.error("Scanning needs a connection")
      return
    }
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
      if (draft.title)
        form.setValue("title", draft.title, { shouldValidate: true })
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

    let splits: Array<{
      memberId: string
      weight?: number
      amountCents?: number
    }>
    let paidById = values.paidById
    let mode: SplitMode = splitMode

    if (isPersonal) {
      paidById = selfMemberId
      mode = "EQUAL"
      splits = [{ memberId: selfMemberId }]
    } else if (splitMode === "PARTS") {
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

    const vars: AddExpenseMutationVars = {
      clientId: crypto.randomUUID(),
      code: room.code,
      title: values.title.trim(),
      category: values.category?.trim() || undefined,
      amountCents: cents,
      currency: values.currency,
      paidById,
      splitMode: mode,
      isPersonal,
      splits,
    }

    mutation.mutate(vars)

    if (!onlineManager.isOnline()) {
      toast.message("Saved offline — will sync when online")
      void navigate({ to: "/r/$code", params: { code } })
    }
  }

  const currencyItems = room.currencies.map((c) => ({
    label: c,
    value: c,
  }))

  return (
    <main className="page-gutter mx-auto max-w-content pt-6">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          className="-ml-2"
          onClick={() => navigate({ to: "/r/$code", params: { code } })}
          aria-label="Back to trip"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} size={20} strokeWidth={2} />
        </Button>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Add expense
        </h1>
      </div>

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
                      className="font-display text-right text-xl tabular-nums tracking-tight"
                      name={field.name}
                      ref={field.ref}
                      onBlur={field.onBlur}
                      value={formatAtmAmountInput(field.value, fractionDigits)}
                      onChange={(e) => {
                        field.onChange(atmDigitsFromInput(e.target.value))
                      }}
                      onFocus={(e) => e.target.select()}
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
                      <SelectTrigger className="min-w-24">
                        <SelectValue>{field.value}</SelectValue>
                      </SelectTrigger>
                      <SelectContent className="min-w-56">
                        {room.currencies.map((c) => (
                          <SelectItem key={c} value={c}>
                            {currencyLabel(c)}
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
                  <Input placeholder="Dinner, taxi, Airbnb…" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="category"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Category (optional)</FormLabel>
                <CategoryChips value={field.value ?? ""} onChange={field.onChange} />
                <FormControl>
                  <Input placeholder="Custom category…" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {isOnline ? (
            <div className="flex flex-col gap-2">
              <FormLabelStatic>Scan ticket (optional)</FormLabelStatic>
              <label className="border-border hover:bg-muted/40 flex h-(--control-height) cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed text-sm">
                <HugeiconsIcon icon={Camera01Icon} size={18} strokeWidth={2} />
                {ocrPending ? "Reading receipt…" : "Scan receipt"}
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  disabled={ocrPending}
                  onChange={(e) => void onScan(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
          ) : null}

          <label className="flex cursor-pointer items-center gap-3 py-1">
            <Checkbox
              checked={isPersonal}
              onCheckedChange={(checked) => setPersonalMode(checked === true)}
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium">Personal</span>
              <span className="block text-xs text-muted-foreground">
                Only you see this · won’t change balances
              </span>
            </span>
          </label>

          {isPersonal ? null : (
            <FormField
              control={form.control}
              name="paidById"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Paid by</FormLabel>
                  <FormControl>
                    <MemberPicker
                      members={room.members}
                      value={field.value}
                      onChange={field.onChange}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {isPersonal ? null : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-3">
                <FormLabelStatic>Split between</FormLabelStatic>
                <Tabs value={splitMode} onValueChange={onSplitModeChange}>
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="EQUAL">Equal</TabsTrigger>
                    <TabsTrigger value="PARTS">Parts</TabsTrigger>
                    <TabsTrigger value="AMOUNT">Amounts</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              <ul className="divide-y divide-border/60">
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
                            active ? "size-9" : "size-9 opacity-40 grayscale"
                          }
                        >
                          <AvatarFallback className="bg-accent text-xs font-semibold text-accent-foreground">
                            {initials(member.name)}
                          </AvatarFallback>
                        </Avatar>
                        <span
                          className={
                            active
                              ? "truncate font-medium"
                              : "truncate text-muted-foreground"
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
                            <HugeiconsIcon
                              icon={MinusSignIcon}
                              size={14}
                              strokeWidth={2}
                            />
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
                            <HugeiconsIcon
                              icon={Add01Icon}
                              size={14}
                              strokeWidth={2}
                            />
                          </Button>
                          <span className="w-16 text-right text-xs text-muted-foreground tabular-nums">
                            {formatMoney(active ? shareCents : 0, currency)}
                          </span>
                        </div>
                      ) : splitMode === "AMOUNT" ? (
                        active ? (
                          <Input
                            inputMode="numeric"
                            autoComplete="off"
                            value={formatAtmAmountInput(
                              amounts[member.id] ?? "",
                              fractionDigits
                            )}
                            onChange={(e) => {
                              onAmountShareChange(
                                member.id,
                                atmDigitsFromInput(e.target.value)
                              )
                            }}
                            onFocus={(e) => e.target.select()}
                            placeholder={formatAtmAmount("", fractionDigits)}
                            size="sm"
                            className="w-28 text-right tabular-nums"
                          />
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            Not included
                          </span>
                        )
                      ) : active ? (
                        <span className="text-sm font-medium tabular-nums">
                          {formatMoney(shareCents, currency)}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          Not included
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {activeMemberIds.length} of {room.members.length} people
                </span>
                {splitMode === "AMOUNT" && amountCents > 0 ? (
                  <span
                    className={
                      remainingCents === 0
                        ? "font-medium text-primary"
                        : "font-medium text-destructive"
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
                <p className="text-xs text-destructive" role="alert">
                  {splitError}
                </p>
              ) : null}
            </div>
          )}

          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Save expense"}
          </Button>
        </form>
      </Form>
    </main>
  )
}

function FormLabelStatic({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-2 text-sm leading-none font-medium text-foreground">
      {children}
    </span>
  )
}
