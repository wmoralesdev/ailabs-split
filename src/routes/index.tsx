import { useEffect, useState } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useMutation } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { z } from "zod"
import { HugeiconsIcon } from "@hugeicons/react"
import { Cancel01Icon } from "@hugeicons/core-free-icons"

import { MemberIdentityPicker } from "@/components/member-identity-picker"
import { RecentTripsList } from "@/components/recent-trips-list"
import { PageShell } from "@/components/page-shell"
import { SiteLogo } from "@/components/site-logo"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { BaseCurrencyPicker } from "@/components/base-currency-picker"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatFxRate } from "@/lib/format-fx-rate"
import { rememberMember } from "@/lib/member-storage"
import { isStandaloneDisplay, markInstallEligible } from "@/lib/pwa-install"
import { resolveMostRecentTripCode, getMostRecentTripCode } from "@/lib/resume-trip"
import { CURRENCY_OPTIONS } from "@/lib/room-code"
import { cn } from "@/lib/utils"
import { fetchFxRates } from "@/server/fx"
import {
  claimMemberById,
  createRoom,
  getRoomByCode,
  joinRoom,
} from "@/server/rooms"
import type { RoomDto } from "@/server/rooms"

type LandingSearch = {
  stay?: boolean
  tab?: "create" | "join"
  code?: string
}

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): LandingSearch => {
    const tabRaw = typeof search.tab === "string" ? search.tab.toLowerCase() : ""
    const codeRaw =
      typeof search.code === "string" ? search.code.trim().toUpperCase() : ""
    return {
      stay:
        search.stay === "1" ||
        search.stay === true ||
        search.stay === "true",
      tab: tabRaw === "join" || codeRaw ? "join" : tabRaw === "create" ? "create" : undefined,
      code: codeRaw || undefined,
    }
  },
  component: LandingPage,
})

const createSchema = z.object({
  name: z.string().trim().min(1, "Name your trip").max(60, "Name is too long"),
  baseCurrency: z.string().min(3),
})
type CreateValues = z.infer<typeof createSchema>

const joinCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .min(6, "Trip code is 6–8 characters")
    .max(8, "Trip code is 6–8 characters"),
})
type JoinCodeValues = z.infer<typeof joinCodeSchema>

function LandingPage() {
  const navigate = useNavigate()
  const { stay, tab, code: joinCode } = Route.useSearch()
  const defaultTab = tab === "join" ? "join" : "create"
  const [resuming, setResuming] = useState(() => {
    if (typeof window === "undefined") return false
    if (stay || tab === "join" || joinCode) return false
    return isStandaloneDisplay() && Boolean(getMostRecentTripCode())
  })

  useEffect(() => {
    if (stay || tab === "join" || joinCode || !isStandaloneDisplay()) return

    let cancelled = false

    void resolveMostRecentTripCode()
      .then((code) => {
        if (cancelled) return
        if (!code) {
          setResuming(false)
          return
        }
        void navigate({
          to: "/r/$code",
          params: { code },
          replace: true,
        })
      })
      .catch(() => {
        if (!cancelled) setResuming(false)
      })

    return () => {
      cancelled = true
    }
  }, [navigate, stay, tab, joinCode])

  if (resuming) {
    return (
      <PageShell
        className="overflow-hidden"
        innerClassName="flex min-h-dvh flex-col items-center justify-center pb-12 pt-5"
      >
        <SiteLogo showWordmark={false} markClassName="size-8" />
        <p className="text-muted-foreground mt-6 text-sm">Opening your trip…</p>
      </PageShell>
    )
  }

  return (
    <PageShell
      className="overflow-hidden"
      innerClassName="flex min-h-dvh flex-col pt-5 pb-12"
    >
      <header className="animate-rise flex items-center justify-between">
        <SiteLogo showWordmark={false} markClassName="size-8" />
        <ThemeToggle />
      </header>

      <div className="animate-rise-delay mt-14 sm:mt-16">
        <h1 className="font-display text-5xl leading-none font-semibold tracking-tighter text-foreground sm:text-6xl md:text-7xl">
          Split
        </h1>
        <p className="mt-4 max-w-[32ch] text-base leading-relaxed text-muted-foreground sm:max-w-sm sm:text-lg">
          Share a trip code. Split costs. No accounts.
        </p>
      </div>

      <div className="animate-rise-delay-2 pb-safe mt-10 flex-1">
        <Tabs defaultValue={defaultTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="create">Create</TabsTrigger>
            <TabsTrigger value="join">Join</TabsTrigger>
          </TabsList>
          <TabsContent value="create" className="mt-6 text-base">
            <CreateForm navigate={navigate} />
          </TabsContent>
          <TabsContent value="join" className="mt-6 text-base">
            <JoinForm navigate={navigate} initialCode={joinCode} />
          </TabsContent>
        </Tabs>
        <RecentTripsList />
      </div>
    </PageShell>
  )
}

function CreateForm({
  navigate,
}: {
  navigate: ReturnType<typeof useNavigate>
}) {
  const form = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { name: "", baseCurrency: "USD" },
  })
  const baseCurrency = form.watch("baseCurrency")

  const [members, setMembers] = useState<string[]>([])
  const [memberDraft, setMemberDraft] = useState("")
  const [membersError, setMembersError] = useState<string | null>(null)
  const [extras, setExtras] = useState<Record<string, string>>({})
  const [showExtras, setShowExtras] = useState(false)
  const [fxDate, setFxDate] = useState<string | null>(null)
  const [fxLoading, setFxLoading] = useState(false)

  const mutation = useMutation({
    mutationFn: (data: {
      name: string
      currency: string
      currencies: string[]
      fxRates: Record<string, number>
      memberNames: string[]
    }) => createRoom({ data }),
    onSuccess: async (room) => {
      markInstallEligible()
      toast.success("Trip created")
      await navigate({
        to: "/r/$code",
        params: { code: room.code },
        search: { created: true },
      })
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Could not create trip"
      )
    },
  })

  // Prefill empty rates from Frankfurter when extras are added or base changes.
  useEffect(() => {
    const missing = Object.entries(extras)
      .filter(([code, rate]) => code !== baseCurrency && rate.trim() === "")
      .map(([code]) => code)
    if (missing.length === 0) return

    let cancelled = false
    setFxLoading(true)

    void fetchFxRates({ data: { base: baseCurrency, quotes: missing } })
      .then((result) => {
        if (cancelled) return
        setFxDate(result.date)
        setExtras((prev) => {
          const next = { ...prev }
          let changed = false
          for (const [code, rate] of Object.entries(result.rates)) {
            if (code in next && next[code].trim() === "") {
              next[code] = formatFxRate(rate)
              changed = true
            }
          }
          return changed ? next : prev
        })
      })
      .catch(() => {
        if (!cancelled) {
          toast.error("Could not load live rates — enter them manually")
        }
      })
      .finally(() => {
        if (!cancelled) setFxLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [baseCurrency, extras])

  function commitDraft() {
    const parts = memberDraft
      .split(/[\n,]/)
      .map((name) => name.trim())
      .filter(Boolean)
    if (parts.length === 0) return
    setMembers((prev) => {
      const next = [...prev]
      for (const part of parts) {
        if (!next.some((m) => m.toLowerCase() === part.toLowerCase())) {
          next.push(part)
        }
      }
      return next
    })
    setMemberDraft("")
    setMembersError(null)
  }

  function removeMember(name: string) {
    setMembers((prev) => prev.filter((m) => m !== name))
  }

  function toggleExtra(code: string) {
    setShowExtras(true)
    setExtras((prev) => {
      const next = { ...prev }
      if (code in next) {
        delete next[code]
      } else {
        next[code] = ""
      }
      return next
    })
  }

  function onBaseCurrencyChange(value: string) {
    form.setValue("baseCurrency", value)
    setFxDate(null)
    setExtras((prev) => {
      const next: Record<string, string> = {}
      for (const code of Object.keys(prev)) {
        if (code !== value) next[code] = ""
      }
      return next
    })
  }

  function onSubmit(values: CreateValues) {
    const names = memberDraft.trim()
      ? [
          ...members,
          ...memberDraft
            .split(/[\n,]/)
            .map((n) => n.trim())
            .filter(Boolean),
        ]
      : members
    const unique = Array.from(
      new Set(names.map((n) => n.trim()).filter(Boolean))
    )
    if (unique.length < 2) {
      setMembersError("Add at least two members")
      return
    }

    const currencies = [values.baseCurrency]
    const fxRates: Record<string, number> = {}
    for (const [code, rateRaw] of Object.entries(extras)) {
      if (code === values.baseCurrency) continue
      const rate = Number.parseFloat(rateRaw)
      currencies.push(code)
      if (Number.isFinite(rate) && rate > 0) {
        fxRates[code] = rate
      }
    }

    mutation.mutate({
      name: values.name.trim(),
      currency: values.baseCurrency,
      currencies,
      fxRates,
      memberNames: unique,
    })
  }

  const extraCodes = Object.keys(extras)
  const extrasOpen = showExtras || extraCodes.length > 0

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-7"
      >
        <div className="flex flex-col gap-5">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Trip name</FormLabel>
                <FormControl>
                  <Input placeholder="Beach weekend" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="baseCurrency"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Base currency</FormLabel>
                <FormControl>
                  <BaseCurrencyPicker
                    value={field.value}
                    onChange={onBaseCurrencyChange}
                  />
                </FormControl>
                <FormDescription>
                  Balances and settle-up use this currency.
                </FormDescription>
              </FormItem>
            )}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label>Members</Label>
          {members.length > 0 ? (
            <div className="mb-1 flex flex-wrap gap-2">
              {members.map((name, index) => (
                <span
                  key={name}
                  className="landing-member-chip animate-rise"
                  style={{ animationDelay: `${index * 40}ms` }}
                >
                  {name}
                  <button
                    type="button"
                    onClick={() => removeMember(name)}
                    className="inline-flex size-5 items-center justify-center rounded-sm transition-colors hover:bg-background/70"
                    aria-label={`Remove ${name}`}
                  >
                    <HugeiconsIcon
                      icon={Cancel01Icon}
                      size={12}
                      strokeWidth={2}
                    />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          <div className="flex gap-2">
            <Input
              value={memberDraft}
              onChange={(e) => setMemberDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault()
                  commitDraft()
                }
              }}
              onBlur={commitDraft}
              placeholder="Type a name"
              className="flex-1"
            />
            <Button
              type="button"
              variant="outline"
              className="shrink-0 px-4"
              onClick={commitDraft}
              disabled={!memberDraft.trim()}
            >
              Add
            </Button>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            At least two people. Add, Enter, or comma.
          </p>
          {membersError ? (
            <p className="text-xs text-destructive" role="alert">
              {membersError}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 border-t border-border/60 pt-5">
          {!extrasOpen ? (
            <button
              type="button"
              onClick={() => setShowExtras(true)}
              className="text-left text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Add other currencies
            </button>
          ) : (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <Label>Other currencies</Label>
                <button
                  type="button"
                  onClick={() => {
                    if (extraCodes.length === 0) setShowExtras(false)
                  }}
                  className={cn(
                    "text-xs font-medium text-muted-foreground transition-colors",
                    extraCodes.length === 0
                      ? "hover:text-foreground"
                      : "pointer-events-none opacity-0"
                  )}
                >
                  Hide
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {CURRENCY_OPTIONS.filter((o) => o.code !== baseCurrency).map(
                  (o) => {
                    const on = o.code in extras
                    return (
                      <button
                        key={o.code}
                        type="button"
                        onClick={() => toggleExtra(o.code)}
                        className={cn(
                          "landing-chip",
                          on ? "landing-chip-on" : "landing-chip-idle"
                        )}
                      >
                        {o.code}
                      </button>
                    )
                  }
                )}
              </div>
              {extraCodes.length > 0 ? (
                <div className="animate-rise-delay-3 mt-1 flex flex-col gap-2">
                  {extraCodes.map((code) => (
                    <div key={code} className="flex items-center gap-2 text-sm">
                      <span className="w-24 shrink-0 text-muted-foreground tabular-nums">
                        1 {baseCurrency} =
                      </span>
                      <Input
                        inputMode="decimal"
                        value={extras[code] ?? ""}
                        onChange={(e) =>
                          setExtras((prev) => ({
                            ...prev,
                            [code]: e.target.value,
                          }))
                        }
                        placeholder="rate"
                        className="flex-1"
                        size="sm"
                      />
                      <span className="w-10 shrink-0 font-medium">{code}</span>
                    </div>
                  ))}
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {fxLoading
                      ? "Fetching live rates…"
                      : fxDate
                        ? `Rates from Frankfurter (${fxDate}) — edit for your trip.`
                        : "Live rates fill when available. Leave blank to set later."}
                  </p>
                </div>
              ) : null}
            </>
          )}
        </div>

        <Button
          type="submit"
          disabled={mutation.isPending}
          className="mt-1 w-full transition-transform duration-200 active:scale-[0.98]"
        >
          {mutation.isPending ? "Creating…" : "Create trip"}
        </Button>
      </form>
    </Form>
  )
}

function JoinForm({
  navigate,
  initialCode,
}: {
  navigate: ReturnType<typeof useNavigate>
  initialCode?: string
}) {
  const [room, setRoom] = useState<RoomDto | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [autoLookupDone, setAutoLookupDone] = useState(false)

  const form = useForm<JoinCodeValues>({
    resolver: zodResolver(joinCodeSchema),
    defaultValues: { code: initialCode ?? "" },
  })

  const lookupMutation = useMutation({
    mutationFn: (code: string) => getRoomByCode({ data: { code } }),
    onSuccess: (found) => {
      if (!found) {
        toast.error("Trip not found")
        return
      }
      setError(null)
      setRoom(found)
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Could not find trip")
    },
  })

  useEffect(() => {
    if (autoLookupDone || !initialCode) return
    if (initialCode.length < 6) return
    setAutoLookupDone(true)
    lookupMutation.mutate(initialCode)
    // One-shot prefill lookup from ?code=
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally run once per initialCode
  }, [autoLookupDone, initialCode])

  function onCodeSubmit(values: JoinCodeValues) {
    lookupMutation.mutate(values.code.toUpperCase())
  }

  function goBackToCode() {
    setRoom(null)
    setError(null)
    setPending(false)
  }

  async function pickExisting(memberId: string) {
    if (!room) return
    setError(null)
    setPending(true)
    try {
      const claimed = await claimMemberById({
        data: { code: room.code, memberId },
      })
      rememberMember(room.code, claimed.memberId)
      markInstallEligible()
      toast.success(`Joined ${room.name}`)
      await navigate({ to: "/r/$code", params: { code: room.code } })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not claim member")
    } finally {
      setPending(false)
    }
  }

  async function claimName(name: string) {
    if (!room) return
    setError(null)
    setPending(true)
    try {
      const result = await joinRoom({
        data: { code: room.code, memberName: name },
      })
      rememberMember(result.room.code, result.memberId)
      markInstallEligible()
      toast.success(`Joined ${result.room.name}`)
      await navigate({ to: "/r/$code", params: { code: result.room.code } })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join trip")
    } finally {
      setPending(false)
    }
  }

  if (room) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
            Joining
          </p>
          <p className="mt-1 font-display text-2xl font-semibold tracking-tight text-foreground">
            {room.name}
          </p>
          <p className="mt-1 font-display tracking-[0.22em] text-muted-foreground">
            {room.code}
          </p>
        </div>

        <MemberIdentityPicker
          members={room.members}
          pending={pending}
          error={error}
          onPickExisting={(id) => void pickExisting(id)}
          onClaimName={(name) => void claimName(name)}
        />

        <button
          type="button"
          className="text-left text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          onClick={goBackToCode}
          disabled={pending}
        >
          Different trip code
        </button>
      </div>
    )
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onCodeSubmit)}
        className="flex flex-col gap-6"
      >
        <FormField
          control={form.control}
          name="code"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Trip code</FormLabel>
              <div className="flex items-center gap-2">
                <FormControl>
                  <Input
                    placeholder="7-character code"
                    maxLength={8}
                    className="text-center font-display text-2xl tracking-[0.2em] uppercase"
                    {...field}
                    onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                  />
                </FormControl>
                <Button
                  type="submit"
                  size="sm"
                  disabled={lookupMutation.isPending}
                  className="shrink-0 transition-transform duration-200 active:scale-[0.98]"
                >
                  {lookupMutation.isPending ? "Looking up…" : "Continue"}
                </Button>
              </div>
              <FormDescription>
                Enter the shared code, then pick who you are.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </form>
    </Form>
  )
}
