import type { useNavigate } from "@tanstack/react-router"
import { useMutation } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { z } from "zod"

import { BaseCurrencyPicker } from "@/components/base-currency-picker"
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
import { rememberMember } from "@/lib/member-storage"
import { markInstallEligible } from "@/lib/pwa-install"
import { createRoom } from "@/server/rooms"

const dinnerSchema = z.object({
  name: z.string().trim().min(1, "Name your dinner").max(60, "Name is too long"),
  currency: z.string().min(3),
  creatorName: z.string().trim().min(1, "Enter your name").max(40, "Name is too long"),
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

  const mutation = useMutation({
    mutationFn: (data: DinnerValues) =>
      createRoom({
        data: {
          name: data.name.trim(),
          currency: data.currency,
          currencies: [data.currency],
          memberNames: [data.creatorName.trim()],
          kind: "DINNER",
        },
      }),
    onSuccess: async (room) => {
      rememberMember(room.code, room.members[0].id)
      markInstallEligible()
      toast.success("Dinner created")
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

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
        className="flex flex-col gap-7"
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Dinner name</FormLabel>
              <FormControl>
                <Input placeholder="Biblioteca Friday" {...field} />
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
                <BaseCurrencyPicker
                  value={field.value}
                  onChange={field.onChange}
                />
              </FormControl>
              <FormDescription>
                One currency for this dinner. No FX.
              </FormDescription>
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
                <Input placeholder="Ana" {...field} />
              </FormControl>
              <FormDescription>
                You can add other people after, or they join with the code.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type="submit"
          disabled={mutation.isPending}
          className="mt-1 w-full transition-transform duration-200 active:scale-[0.98]"
        >
          {mutation.isPending ? "Creating…" : "Create dinner"}
        </Button>
      </form>
    </Form>
  )
}
