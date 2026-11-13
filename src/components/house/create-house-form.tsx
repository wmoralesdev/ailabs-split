import { useEffect, useState } from "react"
import type { useNavigate } from "@tanstack/react-router"
import { useMutation } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { z } from "zod"

import { BaseCurrencyPicker } from "@/components/base-currency-picker"
import { HouseDateChips } from "@/components/house/house-date-chips"
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
  secondaryAction,
}: {
  navigate: ReturnType<typeof useNavigate>
  displayName?: string
  secondaryAction?: { label: string; onClick: () => void }
}) {
  return (
    <WithDisplayName serverName={displayName}>
      {(resolved) => (
        <CreateHouseFields
          navigate={navigate}
          displayName={resolved}
          secondaryAction={secondaryAction}
        />
      )}
    </WithDisplayName>
  )
}

function CreateHouseFields({
  navigate,
  displayName,
  secondaryAction,
}: {
  navigate: ReturnType<typeof useNavigate>
  displayName: string
  secondaryAction?: { label: string; onClick: () => void }
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

          <FormField
            control={form.control}
            name="joinedOn"
            render={({ field }) => (
              <Field>
                {editMovedIn ? (
                  <>
                    <FieldLabel>Moved in</FieldLabel>
                    <HouseDateChips
                      label="Moved in"
                      value={field.value}
                      onChange={(next) => {
                        if (!next) return
                        field.onChange(next)
                      }}
                    />
                  </>
                ) : (
                  <SummaryRow
                    lead="Moved in"
                    value={movedInLabel(field.value, today, yesterday)}
                    action="Change date"
                    onAction={() => setEditMovedIn(true)}
                  />
                )}
              </Field>
            )}
          />

          <FormField
            control={form.control}
            name="currency"
            render={({ field }) => (
              <Field>
                {editCurrency ? (
                  <>
                    <FieldLabel>Currency</FieldLabel>
                    <BaseCurrencyPicker
                      value={field.value}
                      onChange={(next) => {
                        field.onChange(next)
                        setEditCurrency(false)
                      }}
                    />
                  </>
                ) : (
                  <SummaryRow
                    lead="Paying in"
                    value={currency}
                    action="Change currency"
                    onAction={() => setEditCurrency(true)}
                  />
                )}
              </Field>
            )}
          />
        </FieldGroup>

        <div className="form-dock flex flex-col items-center gap-1">
          <Button
            type="submit"
            disabled={mutation.isPending}
            className="cta-lg"
          >
            {mutation.isPending ? "Starting…" : "Start house"}
          </Button>
          {secondaryAction ? (
            <button
              type="button"
              className="text-action text-[15px]"
              onClick={secondaryAction.onClick}
            >
              {secondaryAction.label}
            </button>
          ) : null}
        </div>
      </form>
    </Form>
  )
}

function movedInLabel(value: string, today: string, yesterday: string) {
  if (value === today) return "today"
  if (value === yesterday) return "yesterday"
  return isIsoDate(value) ? formatDay(value) : "today"
}

function SummaryRow({
  lead,
  value,
  action,
  onAction,
}: {
  lead: string
  value: string
  action: string
  onAction: () => void
}) {
  return (
    <div className="-mt-1 flex min-h-11 items-center justify-between gap-3">
      <p className="text-[15px] text-muted-foreground">
        {lead} <span className="font-semibold text-foreground">{value}</span>
      </p>
      <button
        type="button"
        className="text-action text-[15px]"
        onClick={onAction}
      >
        {action}
      </button>
    </div>
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
