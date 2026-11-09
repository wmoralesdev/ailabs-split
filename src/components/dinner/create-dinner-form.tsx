import { useEffect, useState } from "react"
import type { useNavigate } from "@tanstack/react-router"
import { useMutation } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { z } from "zod"

import { BaseCurrencyPicker } from "@/components/base-currency-picker"
import { NameListInput } from "@/components/name-list-input"
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
import {
  defaultDinnerName,
  getLastCurrency,
  getLastName,
  mergeNames,
  rememberCurrency,
  rememberName,
} from "@/lib/landing-prefs"
import { rememberMember } from "@/lib/member-storage"
import { markInstallEligible } from "@/lib/pwa-install"
import { createRoom } from "@/server/rooms"

const dinnerSchema = z.object({
  name: z.string().trim().max(60, "Name is too long"),
  currency: z.string().min(3),
  creatorName: z
    .string()
    .trim()
    .min(1, "Write your name so the others know who paid")
    .max(40, "Name is too long"),
})
type DinnerValues = z.infer<typeof dinnerSchema>

export function CreateDinnerForm({
  navigate,
}: {
  navigate: ReturnType<typeof useNavigate>
}) {
  const form = useForm<DinnerValues>({
    resolver: zodResolver(dinnerSchema),
    defaultValues: { name: "", currency: "USD", creatorName: "" },
  })
  const [guests, setGuests] = useState<string[]>([])
  const [guestDraft, setGuestDraft] = useState("")
  const [editCurrency, setEditCurrency] = useState(false)
  const [fallbackName, setFallbackName] = useState("Dinner")
  const currency = form.watch("currency")
  const creatorName = form.watch("creatorName")

  useEffect(() => {
    setFallbackName(defaultDinnerName())
    const lastName = getLastName()
    if (lastName && !form.getValues("creatorName")) {
      form.setValue("creatorName", lastName)
    }
    const lastCurrency = getLastCurrency()
    if (lastCurrency) form.setValue("currency", lastCurrency)
  }, [form])

  const mutation = useMutation({
    mutationFn: (data: {
      name: string
      currency: string
      memberNames: string[]
    }) =>
      createRoom({
        data: {
          name: data.name,
          currency: data.currency,
          currencies: [data.currency],
          memberNames: data.memberNames,
          kind: "DINNER",
        },
      }),
    onSuccess: async (room, variables) => {
      const creator =
        room.members.find(
          (member) =>
            member.name.toLowerCase() === variables.memberNames[0].toLowerCase()
        ) ?? room.members[0]
      rememberMember(room.code, creator.id)
      markInstallEligible()
      await navigate({
        to: "/r/$code",
        params: { code: room.code },
        search: { created: true },
      })
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Could not create dinner"
      )
    },
  })

  function onSubmit(values: DinnerValues) {
    const creator = values.creatorName.trim()
    const others = mergeNames(guests, guestDraft).filter(
      (name) => name.toLowerCase() !== creator.toLowerCase()
    )
    rememberName(creator)
    rememberCurrency(values.currency)
    mutation.mutate({
      name: values.name.trim() || fallbackName,
      currency: values.currency,
      memberNames: [creator, ...others],
    })
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-6"
      >
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
                  enterKeyHint="next"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <NameListInput
          id="dinner-guests"
          label="Who else is at the table?"
          names={guests}
          draft={guestDraft}
          onNamesChange={setGuests}
          onDraftChange={setGuestDraft}
          placeholder="Ben, Cam…"
          hint="Optional. Anyone can also join with the code."
          fixed={creatorName.trim() ? [creatorName.trim()] : []}
        />

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Dinner name</FormLabel>
              <FormControl>
                <Input
                  placeholder={fallbackName}
                  enterKeyHint="done"
                  {...field}
                />
              </FormControl>
              <FormDescription>
                Optional. Leave it blank for “{fallbackName}”.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="currency"
          render={({ field }) => (
            <FormItem>
              {editCurrency ? (
                <>
                  <FormLabel>Currency</FormLabel>
                  <FormControl>
                    <BaseCurrencyPicker
                      value={field.value}
                      onChange={(next) => {
                        field.onChange(next)
                        setEditCurrency(false)
                      }}
                    />
                  </FormControl>
                </>
              ) : (
                <div className="flex min-h-11 items-center justify-between gap-3">
                  <p className="text-base text-muted-foreground">
                    Paying in{" "}
                    <span className="font-semibold text-foreground">
                      {currency}
                    </span>
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditCurrency(true)}
                  >
                    Change currency
                  </Button>
                </div>
              )}
            </FormItem>
          )}
        />

        <div className="form-dock">
          <Button
            type="submit"
            disabled={mutation.isPending}
            className="cta-lg"
          >
            {mutation.isPending ? "Creating…" : "Create dinner"}
          </Button>
        </div>
      </form>
    </Form>
  )
}
