import { useEffect, useRef, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowRight01Icon } from "@hugeicons/core-free-icons"
import { toast } from "sonner"

import { ChipRow } from "@/components/chip-row"
import { PayAccountButton } from "@/components/pay-account-button"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  PAY_ACCOUNT_MAX,
  PAY_ACCOUNT_TYPES,
  PAY_LABEL_MAX,
  normalizePayText,
  payAccountTypeLabel,
  payDetailsLine,
} from "@/lib/pay-details"
import type { PayAccountType, PayDetailsDto } from "@/lib/pay-details"
import { roomKeys } from "@/lib/room-query"
import type { RoomKind } from "@/lib/room-kind"
import { savePayDetails } from "@/server/pay-details"
import type { RoomDto, RoomMemberDto } from "@/server/rooms"

function roomNoun(kind: RoomKind): string {
  switch (kind) {
    case "DINNER":
      return "bill"
    case "TRIP":
      return "trip"
    case "HOUSEHOLD":
      return "house"
    default: {
      const _never: never = kind
      return String(_never)
    }
  }
}

function scopeCopy(room: RoomDto, self: boolean): string {
  if (self && room.viewerSignedIn) {
    return "Saved to your account. It shows in every bill, trip and house you're in."
  }
  return `Only on this ${roomNoun(room.kind)}.`
}

/** Second line under "You · name" on a room home. */
export function MyPayLine({ pay }: { pay: PayDetailsDto | null }) {
  return pay ? (
    <span className="block truncate text-[13px] text-muted-foreground tabular-nums">
      {payDetailsLine(pay)}
    </span>
  ) : (
    <span className="block truncate text-[13px] font-medium text-primary">
      Add your account number
    </span>
  )
}

/** Person-sheet row that opens the mini pay profile. */
export function PayDetailsRow({
  pay,
  onClick,
}: {
  pay: PayDetailsDto | null
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="group-list group-row-hit w-full text-left"
      onClick={onClick}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] text-muted-foreground">
          Account number
        </span>
        {pay ? (
          <span className="block truncate font-medium tabular-nums">
            {payDetailsLine(pay)}
          </span>
        ) : (
          <span className="block font-medium text-primary">
            Add account number
          </span>
        )}
      </span>
      <HugeiconsIcon
        icon={ArrowRight01Icon}
        size={16}
        strokeWidth={2}
        className="shrink-0 text-muted-foreground"
      />
    </button>
  )
}

/** Mini profile: who they are and where to send them money. */
export function PayProfileSheet({
  room,
  member,
  viewerMemberId,
  canEdit = true,
  open,
  onOpenChange,
}: {
  room: RoomDto
  member: RoomMemberDto | null
  viewerMemberId: string | null
  /** False shows the number read-only; a seat claimed by someone else is always read-only. */
  canEdit?: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const accountRef = useRef<HTMLInputElement>(null)
  const [account, setAccount] = useState("")
  const [label, setLabel] = useState("")
  const [accountType, setAccountType] = useState<PayAccountType | null>(null)

  useEffect(() => {
    if (!open || !member) return
    setAccount(member.pay?.account ?? "")
    setLabel(member.pay?.label ?? "")
    setAccountType(member.pay?.accountType ?? null)
  }, [
    open,
    member?.id,
    member?.pay?.account,
    member?.pay?.label,
    member?.pay?.accountType,
  ])

  const saveMutation = useMutation({
    mutationFn: (input: {
      memberId: string
      account: string
      label: string
      accountType: PayAccountType | null
    }) =>
      savePayDetails({
        data: {
          code: room.code,
          memberId: input.memberId,
          account: input.account,
          label: input.label,
          accountType: input.accountType,
          ...(viewerMemberId ? { viewerMemberId } : {}),
        },
      }),
    onSuccess: async (_room, input) => {
      onOpenChange(false)
      toast.success(input.account ? "Account saved" : "Account removed")
      await queryClient.invalidateQueries({
        queryKey: roomKeys.room(room.code),
      })
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Could not save the account"
      )
    },
  })

  if (!member) {
    return <Sheet open={open} onOpenChange={onOpenChange} />
  }

  const self = member.id === viewerMemberId
  const nextAccount = normalizePayText(account)
  const nextLabel = nextAccount ? normalizePayText(label) : ""
  const nextType = nextAccount ? accountType : null
  const dirty =
    nextAccount !== (member.pay?.account ?? "") ||
    nextLabel !== (member.pay?.label ?? "") ||
    nextType !== (member.pay?.accountType ?? null)
  const saving = saveMutation.isPending
  const owner = self ? "Your" : `${member.name}'s`
  const readOnly = member.payLocked || !canEdit

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="flex max-h-[92dvh] flex-col gap-0 rounded-t-3xl bg-background p-0"
        initialFocus={readOnly ? undefined : accountRef}
      >
        <div className="mx-auto flex min-h-0 w-full max-w-content flex-1 flex-col">
          <SheetHeader className="gap-1 px-4 pt-4 pb-2 text-left">
            <p className="eyebrow">Pay details</p>
            <SheetTitle className="font-display text-[22px] leading-tight font-semibold tracking-tight">
              {self ? `${member.name} (you)` : member.name}
            </SheetTitle>
            <SheetDescription className="sr-only">
              {owner} account number, so people can pay in one tap.
            </SheetDescription>
          </SheetHeader>

          {readOnly ? (
            <div className="flex flex-col gap-2 px-4 pt-2 pb-6">
              {member.pay ? (
                <PayAccountButton pay={member.pay} ownerLabel={owner} />
              ) : (
                <p className="text-[15px] text-muted-foreground">
                  No account number yet.
                </p>
              )}
              {member.payLocked ? (
                <p className="text-[13px] text-muted-foreground">
                  {member.name} keeps this number on their account.
                </p>
              ) : null}
            </div>
          ) : (
            <form
              className="flex min-h-0 flex-1 flex-col"
              onSubmit={(event) => {
                event.preventDefault()
                if (!dirty || saving) return
                saveMutation.mutate({
                  memberId: member.id,
                  account: nextAccount,
                  label: nextLabel,
                  accountType: nextType,
                })
              }}
            >
              <div className="flex flex-col gap-4 px-4 pt-2 pb-4">
                <div className="grid gap-2">
                  <Label htmlFor="pay-account">Account number</Label>
                  <Input
                    ref={accountRef}
                    id="pay-account"
                    value={account}
                    onChange={(event) => setAccount(event.target.value)}
                    placeholder="IBAN or account number"
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    maxLength={PAY_ACCOUNT_MAX}
                    enterKeyHint="next"
                    className="h-12 bg-card px-3.5 text-[17px] tracking-wide tabular-nums"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="pay-label">
                    Bank{" "}
                    <span className="font-normal text-muted-foreground">
                      (optional)
                    </span>
                  </Label>
                  <Input
                    id="pay-label"
                    value={label}
                    onChange={(event) => setLabel(event.target.value)}
                    placeholder="BAC, BCR…"
                    autoComplete="off"
                    maxLength={PAY_LABEL_MAX}
                    enterKeyHint="done"
                    disabled={!nextAccount}
                    className="h-12 bg-card px-3.5"
                  />
                </div>
                <div className="grid gap-2">
                  <p
                    id="pay-type-label"
                    className="flex items-center gap-1 text-[13px] leading-none font-medium text-muted-foreground"
                  >
                    Account type{" "}
                    <span className="font-normal text-muted-foreground">
                      (optional)
                    </span>
                  </p>
                  <ChipRow
                    role="group"
                    aria-label="Account type"
                    bleed
                    className="[--chip-bleed:1rem]"
                  >
                    {PAY_ACCOUNT_TYPES.map((type) => (
                      <button
                        key={type}
                        type="button"
                        className="person-chip"
                        aria-pressed={nextType === type}
                        disabled={!nextAccount}
                        onClick={() =>
                          setAccountType((current) =>
                            current === type ? null : type
                          )
                        }
                      >
                        {payAccountTypeLabel(type)}
                      </button>
                    ))}
                  </ChipRow>
                </div>
                <p className="text-[13px] leading-snug text-muted-foreground">
                  {scopeCopy(room, self)}
                </p>
              </div>

              <SheetFooter className="pb-safe border-t border-border px-4 pt-3">
                <Button
                  type="submit"
                  className="cta-lg disabled:opacity-40"
                  disabled={saving || !dirty}
                >
                  {saving
                    ? "Saving…"
                    : member.pay && !nextAccount
                      ? "Remove number"
                      : "Save"}
                </Button>
              </SheetFooter>
            </form>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
