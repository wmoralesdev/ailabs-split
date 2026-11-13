import { useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons"

import { RecurringTemplateSheet } from "@/components/house/recurring-template-sheet"
import { Button } from "@/components/ui/button"
import { houseCategoryDisplay } from "@/lib/house-categories"
import { canCreateTemplate, canEditTemplate } from "@/lib/house-permissions"
import type { RecurringTemplateDto } from "@/lib/house-types"
import { formatMoney } from "@/lib/settle"
import type { RoomDto } from "@/server/rooms"

function splitLabel(mode: string): string {
  if (mode === "PARTS") return "Parts"
  if (mode === "AMOUNT") return "Amounts"
  return "Equal"
}

function templateLine(
  template: RecurringTemplateDto,
  members: Array<{ id: string; name: string }>,
  currency: string
): string {
  const paidBy =
    members.find((member) => member.id === template.paidById)?.name ?? "Someone"
  const amount =
    template.kind === "VARIABLE" || template.amountCents == null
      ? "Amount changes every month"
      : formatMoney(template.amountCents, currency)
  return `${houseCategoryDisplay(template.category)} · ${amount} · every month · ${paidBy} pays · ${splitLabel(template.splitMode)}`
}

export function HouseRecurring({ room }: { room: RoomDto }) {
  const navigate = useNavigate()
  const role = room.house?.viewer.role ?? "VISITOR"
  const actorId = room.house?.viewer.memberId ?? null
  const members = room.house?.members ?? []
  const templates = room.house?.templates ?? []
  const canAdd = canCreateTemplate(role)
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const editing =
    templates.find((template) => template.id === editingId) ?? null
  const active = templates.filter((template) => !template.archivedAt)
  const archived = templates.filter((template) => template.archivedAt)

  function openNew() {
    setEditingId(null)
    setOpen(true)
  }

  function openEdit(template: RecurringTemplateDto) {
    const isAuthor = Boolean(actorId && template.createdByMemberId === actorId)
    if (!canEditTemplate(role, isAuthor) && !canAdd) return
    setEditingId(template.id)
    setOpen(true)
  }

  return (
    <main className="page-gutter mx-auto w-full max-w-content pt-2 pb-8">
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="icon-hit -ml-3 size-11"
          onClick={() =>
            void navigate({ to: "/r/$code", params: { code: room.code } })
          }
          aria-label="Back to house"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} size={20} strokeWidth={2} />
        </button>
        <h1 className="font-display text-[22px] font-bold tracking-tight">
          Recurring
        </h1>
      </div>

      {active.length === 0 ? (
        <div className="surface mt-6 px-4 py-4">
          <p className="font-medium text-foreground">Nothing recurring yet</p>
          <p className="mt-1 text-[15px] leading-snug text-muted-foreground">
            Rent, internet, or anything that comes back every month.
          </p>
        </div>
      ) : (
        <ul className="group-list mt-6">
          {active.map((template) => (
            <li key={template.id}>
              <button
                type="button"
                className="group-row-hit w-full text-left"
                onClick={() => openEdit(template)}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {template.title}
                  </span>
                  <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">
                    {templateLine(template, members, room.currency)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {archived.length > 0 ? (
        <section className="mt-8">
          <h2 className="group-label">Archived</h2>
          <ul className="group-list mt-1">
            {archived.map((template) => (
              <li key={template.id} className="group-row">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {template.title}
                  </span>
                  <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">
                    {templateLine(template, members, room.currency)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {canAdd ? (
        <Button type="button" className="cta-lg mt-8" onClick={openNew}>
          Add recurring
        </Button>
      ) : null}

      <RecurringTemplateSheet
        room={room}
        template={open ? editing : null}
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) setEditingId(null)
        }}
      />
    </main>
  )
}
