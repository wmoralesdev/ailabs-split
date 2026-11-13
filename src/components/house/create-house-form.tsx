import { useEffect, useState } from "react"
import type { useNavigate } from "@tanstack/react-router"
import { useMutation } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowRight01Icon } from "@hugeicons/core-free-icons"
import { toast } from "sonner"
import { z } from "zod"

import { BaseCurrencyPicker } from "@/components/base-currency-picker"
import { NameListInput } from "@/components/name-list-input"
import { WithDisplayName } from "@/components/with-display-name"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Form, FormField } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { nextCreatorName } from "@/lib/clerk-display-name"
import {
  addDaysIso,
  formatDay,
  isIsoDate,
  localIsoDate,
} from "@/lib/house-month"
import {
  getLastCurrency,
  getLastName,
  rememberCurrency,
  rememberName,
} from "@/lib/landing-prefs"
import { rememberMember } from "@/lib/member-storage"
import { markInstallEligible } from "@/lib/pwa-install"
import { cn } from "@/lib/utils"
import { createHouse } from "@/server/houses"

const houseSchema = z.object({
  name: z.string().trim().min(1, "Name your house").max(60, "Name is too long"),
  creatorName: z
    .string()
    .trim()
    .min(1, "Write your name")
    .max(40, "Name is too long"),
  currency: z.string().min(3),
  joinedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
})
type HouseValues = z.infer<typeof houseSchema>

function addDaysIsoSafe(iso: string, days: number): string {
  try {
    return addDaysIso(iso, days)
  } catch {
    return iso
  }
}

export function CreateHouseForm({
  navigate,
  displayName = "",
}: {
  navigate: ReturnType<typeof useNavigate>
  displayName?: string
}) {
  return (
    <WithDisplayName serverName={displayName}>
      {(resolved) => (
        <CreateHouseFields navigate={navigate} displayName={resolved} />
      )}
    </WithDisplayName>
  )
}

function CreateHouseFields({
  navigate,
  displayName,
}: {
  navigate: ReturnType<typeof useNavigate>
  displayName: string
}) {
  const today = localIsoDate()
  const yesterday = addDaysIsoSafe(today, -1)
  const form = useForm<HouseValues>({
    resolver: zodResolver(houseSchema),
    defaultValues: {
      name: "",
      creatorName: displayName,
      currency: "USD",
      joinedOn: today,
    },
  })
  const nameEdited = Boolean(form.formState.dirtyFields.creatorName)
  const [editCurrency, setEditCurrency] = useState(false)
  const [editMovedIn, setEditMovedIn] = useState(false)
  const [housemates, setHousemates] = useState<string[]>([])
  const [housemateDraft, setHousemateDraft] = useState("")
  const currency = form.watch("currency")

  useEffect(() => {
    const lastCurrency = getLastCurrency()
    if (lastCurrency) form.setValue("currency", lastCurrency)
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

  const mutation = useMutation({
    mutationFn: (data: {
      name: string
      currency: string
      creatorName: string
      joinedOn: string
      housemateNames: string[]
    }) => createHouse({ data }),
    onSuccess: async (room) => {
      const memberId = room.house?.viewer.memberId ?? room.members[0]?.id
      if (memberId) rememberMember(room.code, memberId)
      markInstallEligible()
      await navigate({
        to: "/r/$code",
        params: { code: room.code },
        search: { created: true },
      })
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Could not start the house"
      )
    },
  })

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => {
          rememberName(values.creatorName)
          rememberCurrency(values.currency)
          mutation.mutate({
            name: values.name,
            currency: values.currency,
            creatorName: values.creatorName,
            joinedOn: values.joinedOn,
            housemateNames: housemates,
          })
        })}
        className="flex flex-col gap-4"
      >
        <FieldGroup className="gap-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid || undefined}>
                <FieldLabel htmlFor="house-name">Name your house</FieldLabel>
                <Input
                  id="house-name"
                  placeholder="Casa Escalón"
                  autoComplete="off"
                  aria-invalid={fieldState.invalid}
                  {...field}
                />
                {fieldState.error ? (
                  <FieldError>{fieldState.error.message}</FieldError>
                ) : null}
              </Field>
            )}
          />

          <FormField
            control={form.control}
            name="creatorName"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid || undefined}>
                <FieldLabel htmlFor="house-creator">Your name</FieldLabel>
                <Input
                  id="house-creator"
                  placeholder="Walter"
                  autoComplete="given-name"
                  aria-invalid={fieldState.invalid}
                  {...field}
                />
                {fieldState.error ? (
                  <FieldError>{fieldState.error.message}</FieldError>
                ) : null}
              </Field>
            )}
          />

          <NameListInput
            id="house-housemates"
            label="Housemates"
            names={housemates}
            draft={housemateDraft}
            onNamesChange={setHousemates}
            onDraftChange={setHousemateDraft}
            placeholder="Ana"
            hint="Add names now or share the code later."
            fixed={
              form.watch("creatorName").trim()
                ? [form.watch("creatorName").trim()]
                : []
            }
          />
        </FieldGroup>

        <ul className="group-list">
          <FormField
            control={form.control}
            name="joinedOn"
            render={({ field }) => (
              <li>
                <SettingRow
                  label="Moved in"
                  value={movedInLabel(field.value, today, yesterday)}
                  open={editMovedIn}
                  onToggle={() => setEditMovedIn((open) => !open)}
                />
                {editMovedIn ? (
                  <div
                    className="flex flex-wrap items-center gap-1.5 px-4 pb-3"
                    role="group"
                    aria-label="Moved in"
                  >
                    <DateChip
                      label="Today"
                      pressed={field.value === today}
                      onClick={() => {
                        field.onChange(today)
                        setEditMovedIn(false)
                      }}
                    />
                    <DateChip
                      label="Yesterday"
                      pressed={field.value === yesterday}
                      onClick={() => {
                        field.onChange(yesterday)
                        setEditMovedIn(false)
                      }}
                    />
                    <Input
                      type="date"
                      value={isIsoDate(field.value) ? field.value : today}
                      onChange={(event) => {
                        const next = event.target.value
                        if (isIsoDate(next)) field.onChange(next)
                      }}
                      aria-label="Pick a date"
                      className="h-9 w-[9.5rem] rounded-full px-3 text-[13px]"
                    />
                  </div>
                ) : null}
              </li>
            )}
          />
          <FormField
            control={form.control}
            name="currency"
            render={({ field }) => (
              <li>
                <SettingRow
                  label="Currency"
                  value={currency}
                  open={editCurrency}
                  onToggle={() => setEditCurrency((open) => !open)}
                />
                {editCurrency ? (
                  <div className="px-4 pb-3">
                    <BaseCurrencyPicker
                      value={field.value}
                      onChange={(next) => {
                        field.onChange(next)
                        setEditCurrency(false)
                      }}
                    />
                  </div>
                ) : null}
              </li>
            )}
          />
        </ul>

        <div className="form-dock">
          <Button
            type="submit"
            disabled={mutation.isPending}
            className="cta-lg"
          >
            {mutation.isPending ? "Starting…" : "Start house"}
          </Button>
        </div>
      </form>
    </Form>
  )
}

function movedInLabel(value: string, today: string, yesterday: string) {
  if (value === today) return "Today"
  if (value === yesterday) return "Yesterday"
  return isIsoDate(value) ? formatDay(value) : "Today"
}

function SettingRow({
  label,
  value,
  open,
  onToggle,
}: {
  label: string
  value: string
  open: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      className="group-row-hit min-h-11 w-full justify-between text-left"
    >
      <span className="text-foreground">{label}</span>
      <span className="flex items-center gap-1 text-muted-foreground tabular-nums">
        {value}
        <HugeiconsIcon
          icon={ArrowRight01Icon}
          size={16}
          strokeWidth={2}
          className={cn(
            "transition-transform duration-200",
            open && "rotate-90"
          )}
        />
      </span>
    </button>
  )
}

function DateChip({
  label,
  pressed,
  onClick,
}: {
  label: string
  pressed: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "h-9 rounded-full px-3 text-[13px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
        pressed
          ? "bg-foreground text-background"
          : "bg-muted text-foreground hover:bg-foreground/10"
      )}
    >
      {label}
    </button>
  )
}

export function SignInToStartHouse({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className="surface flex flex-col gap-3 p-4">
      <p className="font-display text-lg font-semibold tracking-tight">
        Sign in to start a house
      </p>
      <p className="text-[15px] leading-snug text-muted-foreground">
        A house lasts months, so it&rsquo;s tied to your account.
      </p>
      <Button type="button" className="cta-lg" onClick={onSignIn}>
        Sign in
      </Button>
    </div>
  )
}
