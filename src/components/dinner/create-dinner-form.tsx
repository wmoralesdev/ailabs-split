import { useEffect, useState } from "react"
import type { useNavigate } from "@tanstack/react-router"
import { useMutation } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { z } from "zod"

import { BaseCurrencyPicker } from "@/components/base-currency-picker"
import { TicketPhotoPicker } from "@/components/ticket-photo-picker"
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
  defaultDinnerName,
  getLastCurrency,
  getLastName,
  rememberCurrency,
  rememberName,
} from "@/lib/landing-prefs"
import { rememberMember } from "@/lib/member-storage"
import { setPendingTicket } from "@/lib/pending-ticket"
import { markInstallEligible } from "@/lib/pwa-install"
import { createRoom } from "@/server/rooms"

const NAME_REQUIRED = "Write your name so the others know who paid"

const dinnerSchema = z.object({
  currency: z.string().min(3),
  creatorName: z
    .string()
    .trim()
    .min(1, NAME_REQUIRED)
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
    defaultValues: { currency: "USD", creatorName: "" },
  })
  const [editCurrency, setEditCurrency] = useState(false)
  const currency = form.watch("currency")

  useEffect(() => {
    const lastName = getLastName()
    if (lastName && !form.getValues("creatorName")) {
      form.setValue("creatorName", lastName)
    }
    const lastCurrency = getLastCurrency()
    if (lastCurrency) form.setValue("currency", lastCurrency)
  }, [form])

  const mutation = useMutation({
    mutationFn: (data: {
      creatorName: string
      currency: string
      ticket: File | null
    }) =>
      createRoom({
        data: {
          name: defaultDinnerName(),
          currency: data.currency,
          currencies: [data.currency],
          memberNames: [data.creatorName],
          kind: "DINNER",
        },
      }),
    onSuccess: async (room, variables) => {
      rememberMember(room.code, room.members[0].id)
      markInstallEligible()
      if (variables.ticket) {
        setPendingTicket(room.code, {
          file: variables.ticket,
          nameFromTicket: true,
        })
        await navigate({ to: "/r/$code/check", params: { code: room.code } })
        return
      }
      await navigate({ to: "/r/$code", params: { code: room.code } })
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Could not start the dinner"
      )
    },
  })

  function start(values: DinnerValues, ticket: File | null) {
    const creatorName = values.creatorName.trim()
    rememberName(creatorName)
    rememberCurrency(values.currency)
    mutation.mutate({ creatorName, currency: values.currency, ticket })
  }

  /** Synchronous so the file picker still opens inside the tap. */
  function nameReady(): boolean {
    const name = form.getValues("creatorName").trim()
    if (name && name.length <= 40) return true
    form.setError("creatorName", {
      message: name ? "Name is too long" : NAME_REQUIRED,
    })
    form.setFocus("creatorName")
    return false
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => start(values, null))}
        className="flex flex-col gap-4"
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
                <div className="-mt-1 flex min-h-11 items-center justify-between gap-3">
                  <p className="text-[15px] text-muted-foreground">
                    Paying in{" "}
                    <span className="font-semibold text-foreground">
                      {currency}
                    </span>
                  </p>
                  <button
                    type="button"
                    className="text-action text-[15px]"
                    onClick={() => setEditCurrency(true)}
                  >
                    Change currency
                  </button>
                </div>
              )}
            </FormItem>
          )}
        />

        <TicketPhotoPicker
          pending={mutation.isPending}
          pendingLabel={
            mutation.variables?.ticket ? "Opening ticket…" : "Starting…"
          }
          beforePick={nameReady}
          onFile={(file) => {
            if (!file) return
            void form.handleSubmit((values) => start(values, file))()
          }}
          className="mt-1"
        />

        <button
          type="submit"
          disabled={mutation.isPending}
          className="text-action self-center text-[15px]"
        >
          Create without a ticket
        </button>
      </form>
    </Form>
  )
}
