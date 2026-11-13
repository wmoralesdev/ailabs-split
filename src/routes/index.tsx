import { useEffect, useState } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useMutation } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { z } from "zod"
import { HugeiconsIcon } from "@hugeicons/react"
import type { IconSvgElement } from "@hugeicons/react"
import {
  Airplane01Icon,
  Home01Icon,
  Restaurant01Icon,
} from "@hugeicons/core-free-icons"

import { AuthControls } from "@/components/auth-controls"
import { CreateDinnerForm } from "@/components/dinner/create-dinner-form"
import {
  CreateHouseForm,
  SignInToStartHouse,
} from "@/components/house/create-house-form"
import { MemberIdentityPicker } from "@/components/member-identity-picker"
import { NameListInput } from "@/components/name-list-input"
import { RecentTripsList } from "@/components/recent-trips-list"
import { PageShell } from "@/components/page-shell"
import { SiteLogo } from "@/components/site-logo"
import { ThemeToggle } from "@/components/theme-toggle"
import { ToSettleCard } from "@/components/to-settle-card"
import { WithDisplayName } from "@/components/with-display-name"
import { YourRoomsList } from "@/components/your-rooms-list"
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
import { nextCreatorName } from "@/lib/clerk-display-name"
import {
  getLastCurrency,
  getLastKind,
  getLastName,
  rememberCurrency,
  mergeNames,
  rememberKind,
  rememberName,
} from "@/lib/landing-prefs"
import type { LandingKind } from "@/lib/landing-prefs"
import { parseRoomKind, roomKindNoun } from "@/lib/room-kind"
import { rememberMember } from "@/lib/member-storage"
import { useSignedInUserId } from "@/lib/use-auth-user"
import { isStandaloneDisplay, markInstallEligible } from "@/lib/pwa-install"
import {
  resolveMostRecentTripCode,
  getMostRecentTripCode,
} from "@/lib/resume-trip"
import { CURRENCY_OPTIONS } from "@/lib/room-code"
import { cn } from "@/lib/utils"
import { fetchSignedInDisplayName } from "@/server/auth"
import { fetchFxRates } from "@/server/fx"
import {
  claimMemberById,
  createRoom,
  getRoomByCode,
  joinRoom,
  listHiddenRoomCodes,
  listMyRooms,
} from "@/server/rooms"
import type { OwnedRoomDto, RoomDto } from "@/server/rooms"

type LandingSearch = {
  stay?: boolean
  tab?: "create" | "join"
  code?: string
  kind?: "house"
}

export const Route = createFileRoute("/")({
  loader: async ({
    context,
  }): Promise<{
    yours: OwnedRoomDto[]
    hiddenCodes: string[]
    displayName: string
  }> => {
    if (!context.userId) {
      return { yours: [], hiddenCodes: [], displayName: "" }
    }
    const [yours, hiddenCodes, displayName] = await Promise.all([
      listMyRooms(),
      listHiddenRoomCodes(),
      fetchSignedInDisplayName(),
    ])
    return { yours, hiddenCodes, displayName }
  },
  validateSearch: (search: Record<string, unknown>): LandingSearch => {
    const tabRaw =
      typeof search.tab === "string" ? search.tab.toLowerCase() : ""
    const codeRaw =
      typeof search.code === "string" ? search.code.trim().toUpperCase() : ""
    const kindRaw =
      typeof search.kind === "string" ? search.kind.toLowerCase() : ""
    return {
      stay:
        search.stay === "1" || search.stay === true || search.stay === "true",
      tab:
        tabRaw === "join" || codeRaw
          ? "join"
          : tabRaw === "create"
            ? "create"
            : undefined,
      code: codeRaw || undefined,
      kind: kindRaw === "house" ? "house" : undefined,
    }
  },
  component: LandingPage,
})

const createSchema = z.object({
  name: z.string().trim().min(1, "Name your trip").max(60, "Name is too long"),
  creatorName: z
    .string()
    .trim()
    .min(1, "Write your name")
    .max(40, "Name is too long"),
  baseCurrency: z.string().min(3),
})
type CreateValues = z.infer<typeof createSchema>

const joinCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .min(6, "Codes are 6–8 characters")
    .max(8, "Codes are 6–8 characters"),
})
type JoinCodeValues = z.infer<typeof joinCodeSchema>

function LandingPage() {
  const navigate = useNavigate()
  const { yours, hiddenCodes, displayName } = Route.useLoaderData()
  const [listsRevision, setListsRevision] = useState(0)
  const { stay, tab, code: joinCode, kind: kindSearch } = Route.useSearch()
  const userId = useSignedInUserId()
  const defaultTab = tab === "join" ? "join" : "create"
  const [kind, setKind] = useState<LandingKind>("TRIP")
  useEffect(() => {
    if (kindSearch === "house") {
      setKind("HOUSEHOLD")
      rememberKind("HOUSEHOLD")
      return
    }
    const last = getLastKind()
    if (last) setKind(last)
  }, [kindSearch])
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
        <SiteLogo />
        <p className="mt-6 text-sm text-muted-foreground">Opening your trip…</p>
      </PageShell>
    )
  }

  function pickKind(next: LandingKind) {
    setKind(next)
    rememberKind(next)
  }

  return (
    <PageShell innerClassName="flex min-h-dvh flex-col pt-2">
      <header className="flex h-11 items-center justify-between">
        <SiteLogo />
        <div className="flex items-center gap-1">
          <AuthControls />
          <ThemeToggle />
        </div>
      </header>

      <div className="animate-rise mt-3">
        <h1
          data-enter
          className="font-display text-[34px] leading-tight font-bold tracking-tight text-foreground"
        >
          Split
        </h1>
        <p className="mt-1 text-[15px] leading-snug text-muted-foreground">
          {landingTagline(kind)}
        </p>
      </div>

      <Tabs
        defaultValue={defaultTab}
        className="animate-rise-delay mt-5 flex-1"
      >
        <TabsList className="segmented w-full grid-cols-2 group-data-horizontal/tabs:h-9">
          <TabsTrigger value="create" className="segmented-item">
            Create
          </TabsTrigger>
          <TabsTrigger value="join" className="segmented-item">
            Join
          </TabsTrigger>
        </TabsList>
        <TabsContent
          value="create"
          className="tab-panel mt-4 flex flex-col text-base"
        >
          <div
            className="mb-5 grid grid-cols-3 gap-2"
            role="group"
            aria-label="Mode"
          >
            <ModeButton
              label="Bill"
              detail="Tonight"
              icon={Restaurant01Icon}
              active={kind === "DINNER"}
              onClick={() => pickKind("DINNER")}
            />
            <ModeButton
              label="Trip"
              detail="Days"
              icon={Airplane01Icon}
              active={kind === "TRIP"}
              onClick={() => pickKind("TRIP")}
            />
            <ModeButton
              label="House"
              detail="Months"
              icon={Home01Icon}
              active={kind === "HOUSEHOLD"}
              onClick={() => pickKind("HOUSEHOLD")}
            />
          </div>
          {landingCreateForm(kind, {
            navigate,
            displayName,
            signedIn: Boolean(userId),
          })}
        </TabsContent>
        <TabsContent value="join" className="tab-panel mt-6 text-base">
          <JoinForm navigate={navigate} initialCode={joinCode} />
        </TabsContent>
      </Tabs>
      <div className="pb-safe pb-10">
        <ToSettleCard
          yours={yours}
          serverHiddenCodes={hiddenCodes}
          revision={listsRevision}
        />
        <YourRoomsList
          rooms={yours}
          onChanged={() => setListsRevision((n) => n + 1)}
        />
        <RecentTripsList
          ownedCodes={yours.map((room) => room.code)}
          yours={yours}
          serverHiddenCodes={hiddenCodes}
          onChanged={() => setListsRevision((n) => n + 1)}
        />
      </div>
    </PageShell>
  )
}

function landingTagline(kind: LandingKind): string {
  switch (kind) {
    case "DINNER":
      return "Scan the ticket, tap who had what. Everyone sees what they owe."
    case "TRIP":
      return "One code for the whole trip. Settle up at the end."
    case "HOUSEHOLD":
      return "Rent, groceries, and the rest. A running balance."
    default: {
      const _never: never = kind
      return _never
    }
  }
}

function landingCreateForm(
  kind: LandingKind,
  input: {
    navigate: ReturnType<typeof useNavigate>
    displayName: string
    signedIn: boolean
  }
) {
  switch (kind) {
    case "DINNER":
      return (
        <CreateDinnerForm
          navigate={input.navigate}
          displayName={input.displayName}
        />
      )
    case "TRIP":
      return (
        <CreateForm navigate={input.navigate} displayName={input.displayName} />
      )
    case "HOUSEHOLD":
      if (!input.signedIn) {
        return (
          <SignInToStartHouse
            onSignIn={() => {
              void input.navigate({
                to: "/sign-in",
                search: { redirect: "/?stay=true&kind=house" },
              })
            }}
          />
        )
      }
      return (
        <CreateHouseForm
          navigate={input.navigate}
          displayName={input.displayName}
        />
      )
    default: {
      const _never: never = kind
      return _never
    }
  }
}

function ModeButton({
  label,
  detail,
  icon,
  active,
  onClick,
}: {
  label: string
  detail: string
  icon: IconSvgElement
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex flex-col items-start gap-2 rounded-2xl border px-3 pt-3 pb-3 text-left transition-[background-color,border-color,color] duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]",
        active
          ? "border-foreground bg-foreground text-background hover:bg-foreground/90"
          : "border-transparent bg-card text-foreground hover:bg-muted"
      )}
    >
      <span
        className={cn(
          "inline-flex size-8 items-center justify-center rounded-lg",
          active ? "bg-background/15" : "bg-muted"
        )}
      >
        <HugeiconsIcon icon={icon} size={18} strokeWidth={1.8} />
      </span>
      <span>
        <span className="block text-[15px] leading-tight font-semibold">
          {label}
        </span>
        <span
          className={cn(
            "mt-0.5 block text-[13px]",
            active ? "text-background/70" : "text-muted-foreground"
          )}
        >
          {detail}
        </span>
      </span>
    </button>
  )
}

function CreateForm({
  navigate,
  displayName = "",
}: {
  navigate: ReturnType<typeof useNavigate>
  displayName?: string
}) {
  return (
    <WithDisplayName serverName={displayName}>
      {(resolved) => (
        <CreateFormFields navigate={navigate} displayName={resolved} />
      )}
    </WithDisplayName>
  )
}

function CreateFormFields({
  navigate,
  displayName,
}: {
  navigate: ReturnType<typeof useNavigate>
  displayName: string
}) {
  const form = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      name: "",
      creatorName: displayName,
      baseCurrency: "USD",
    },
  })
  const nameEdited = Boolean(form.formState.dirtyFields.creatorName)
  useEffect(() => {
    const last = getLastCurrency()
    if (last) form.setValue("baseCurrency", last)
  }, [form])
  useEffect(() => {
    if (nameEdited) return
    const next = nextCreatorName({
      clerkName: displayName,
      lastName: getLastName(),
    })
    if (!next || form.getValues("creatorName") === next) return
    form.setValue("creatorName", next, {
      shouldDirty: false,
      shouldValidate: false,
    })
  }, [displayName, form, nameEdited])
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
    const unique = mergeNames([values.creatorName, ...members], memberDraft)
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

    rememberName(values.creatorName.trim())
    rememberCurrency(values.baseCurrency)
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
        className="flex flex-col gap-5"
      >
        <div className="flex flex-col gap-4">
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
            name="creatorName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Your name</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Ana"
                    autoComplete="given-name"
                    enterKeyHint="done"
                    {...field}
                  />
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

        <NameListInput
          id="trip-members"
          label="Members"
          names={members}
          draft={memberDraft}
          onNamesChange={(next) => {
            setMembers(next)
            setMembersError(null)
          }}
          onDraftChange={setMemberDraft}
          placeholder="Type a name"
          hint="At least two people, you included."
          error={membersError}
        />

        <div className="flex flex-col gap-3">
          {!extrasOpen ? (
            <button
              type="button"
              onClick={() => setShowExtras(true)}
              className="text-action text-[15px]"
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
                      ? "text-action min-h-8 text-xs"
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

        <div className="form-dock">
          <Button
            type="submit"
            disabled={mutation.isPending}
            className="cta-lg"
          >
            {mutation.isPending ? "Creating…" : "Create trip"}
          </Button>
        </div>
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
        toast.error("Room not found")
        return
      }
      if (parseRoomKind(found.kind) === "HOUSEHOLD") {
        void navigate({ to: "/r/$code", params: { code: found.code } })
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
      <div className="flex flex-col gap-5">
        <div className="surface p-4">
          <p className="eyebrow">
            Joining {roomKindNoun(parseRoomKind(room.kind))}
          </p>
          <p className="mt-0.5 font-display text-xl font-semibold tracking-tight text-foreground">
            {room.name}
          </p>
          <p className="mt-0.5 font-display text-sm tracking-[0.22em] text-muted-foreground">
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
          className="text-action text-[15px]"
          onClick={goBackToCode}
          disabled={pending}
        >
          Use a different code
        </button>
      </div>
    )
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onCodeSubmit)}
        className="flex flex-col gap-5"
      >
        <FormField
          control={form.control}
          name="code"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Code</FormLabel>
              <FormControl>
                <Input
                  placeholder="ABC1234"
                  maxLength={8}
                  autoCapitalize="characters"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="go"
                  className="h-14 rounded-2xl text-center font-display text-2xl tracking-[0.24em] uppercase placeholder:text-muted-foreground/40"
                  {...field}
                  onChange={(e) => {
                    const next = e.target.value.toUpperCase().replace(/\s/g, "")
                    field.onChange(next)
                    if (next.length === 7 && !lookupMutation.isPending) {
                      lookupMutation.mutate(next)
                    }
                  }}
                />
              </FormControl>
              <FormDescription>
                From whoever started the trip or bill. You pick your name next.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button
          type="submit"
          disabled={lookupMutation.isPending}
          className="cta-lg"
        >
          {lookupMutation.isPending ? "Looking up…" : "Continue"}
        </Button>
      </form>
    </Form>
  )
}
