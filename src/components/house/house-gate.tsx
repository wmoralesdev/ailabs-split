import { useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowRight01Icon } from "@hugeicons/core-free-icons"

import { PageShell } from "@/components/page-shell"
import { SiteLogo } from "@/components/site-logo"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { openAuthModal } from "@/lib/auth-modal"
import type { HouseMemberDto } from "@/lib/house-types"
import { useSignedInUserId } from "@/lib/use-auth-user"
import type { RoomDto } from "@/server/rooms"

type HouseGateProps = {
  room: RoomDto
  suggestedName?: string
  pending: boolean
  error: string | null
  onClaimHousemate: (memberId: string) => void
  onJoinHousemate: (name: string) => void
  onJoinGuest: (name: string) => void
  onClaimGuest: (memberId: string) => void
}

export function HouseGate({
  room,
  suggestedName = "",
  pending,
  error,
  onClaimHousemate,
  onJoinHousemate,
  onJoinGuest,
  onClaimGuest,
}: HouseGateProps) {
  const signedIn = Boolean(useSignedInUserId())
  const members = room.house?.members ?? []
  const unclaimed = members.filter(
    (member) => !member.isGuest && !member.claimed
  )
  const guests = members.filter((member) => member.isGuest)
  const [mode, setMode] = useState<"home" | "new" | "guest">(
    unclaimed.length > 0 ? "home" : "new"
  )

  return (
    <PageShell
      className="overflow-hidden"
      innerClassName="flex min-h-dvh flex-col pt-3 pb-10"
    >
      <SiteLogo />
      <h1 className="mt-5 font-display text-[34px] leading-tight font-bold tracking-tight">
        Who are you?
      </h1>
      <p className="mt-1 text-[15px] leading-snug text-muted-foreground">
        You&rsquo;re in{" "}
        <span className="font-medium text-foreground">{room.name}</span> (
        <span className="font-display tracking-widest">{room.code}</span>).
      </p>

      <div className="mt-6 flex flex-col gap-5">
        {mode === "home" ? (
          <HomeMode
            signedIn={signedIn}
            unclaimed={unclaimed}
            guests={guests}
            pending={pending}
            suggestedName={suggestedName}
            onClaimHousemate={onClaimHousemate}
            onClaimGuest={onClaimGuest}
            code={room.code}
            onNew={() => setMode("new")}
            onGuest={() => setMode("guest")}
          />
        ) : null}

        {mode === "new" ? (
          <NameForm
            label="Your name"
            submitLabel={signedIn ? "This is me" : "Sign in to claim"}
            hint={
              signedIn
                ? "We'll add you as a housemate."
                : "A house lasts months, so housemates sign in."
            }
            initial={suggestedName}
            pending={pending}
            signedIn={signedIn}
            code={room.code}
            onSubmit={(name) => onJoinHousemate(name)}
            onBack={
              unclaimed.length > 0 || guests.length > 0
                ? () => setMode("home")
                : undefined
            }
            guestLink={() => setMode("guest")}
          />
        ) : null}

        {mode === "guest" ? (
          <GuestMode
            guests={guests}
            pending={pending}
            onClaimGuest={onClaimGuest}
            onJoinGuest={onJoinGuest}
            onBack={() => setMode(unclaimed.length > 0 ? "home" : "new")}
          />
        ) : null}

        {error ? (
          <p className="text-[13px] text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </PageShell>
  )
}

function HomeMode({
  signedIn,
  unclaimed,
  guests,
  pending,
  code,
  onClaimHousemate,
  onClaimGuest,
  onNew,
  onGuest,
}: {
  signedIn: boolean
  unclaimed: HouseMemberDto[]
  guests: HouseMemberDto[]
  pending: boolean
  suggestedName: string
  onClaimHousemate: (memberId: string) => void
  onClaimGuest: (memberId: string) => void
  code: string
  onNew: () => void
  onGuest: () => void
}) {

  return (
    <>
      {unclaimed.length > 0 ? (
        <>
          <p className="group-label">This is me</p>
          <ul className="group-list">
            {unclaimed.map((member) => (
              <li key={member.id}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    if (signedIn) {
                      onClaimHousemate(member.id)
                      return
                    }
                    openAuthModal({
                      redirect: `/r/${code}?claim=${encodeURIComponent(member.id)}`,
                    })
                  }}
                  className="group-row-hit w-full text-left disabled:opacity-50"
                >
                  <span className="flex-1 text-[15px] font-medium">
                    {member.name}
                  </span>
                  <span className="text-[13px] text-muted-foreground">
                    {signedIn ? "This is me" : "Sign in to claim"}
                  </span>
                  <HugeiconsIcon
                    icon={ArrowRight01Icon}
                    size={16}
                    strokeWidth={2}
                    className="text-muted-foreground/60"
                  />
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <button type="button" className="text-action text-[15px]" onClick={onNew}>
        I&rsquo;m new here
      </button>

      {signedIn ? (
        <button
          type="button"
          className="text-action text-[15px]"
          onClick={onGuest}
        >
          Join as a guest instead
        </button>
      ) : (
        <>
          {guests.length > 0 ? (
            <>
              <p className="group-label mt-2">Join as a guest</p>
              <ul className="group-list">
                {guests.map((member) => (
                  <li key={member.id}>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => onClaimGuest(member.id)}
                      className="group-row-hit w-full text-left disabled:opacity-50"
                    >
                      <span className="flex-1 text-[15px] font-medium">
                        {member.name}
                      </span>
                      <HugeiconsIcon
                        icon={ArrowRight01Icon}
                        size={16}
                        strokeWidth={2}
                        className="text-muted-foreground/60"
                      />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <button
            type="button"
            className="text-action text-[15px]"
            onClick={onGuest}
          >
            Join as a guest
          </button>
          <p className="text-[13px] leading-snug text-muted-foreground">
            Guests see the house and mark what they paid.
          </p>
        </>
      )}
    </>
  )
}

function NameForm({
  label,
  submitLabel,
  hint,
  initial,
  pending,
  signedIn,
  code,
  onSubmit,
  onBack,
  guestLink,
}: {
  label: string
  submitLabel: string
  hint: string
  initial: string
  pending: boolean
  signedIn: boolean
  code: string
  onSubmit: (name: string) => void
  onBack?: () => void
  guestLink: () => void
}) {
  const [name, setName] = useState(initial)

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        const trimmed = name.trim()
        if (!trimmed) return
        if (!signedIn) {
          openAuthModal({ redirect: `/r/${code}` })
          return
        }
        onSubmit(trimmed)
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="house-gate-name">{label}</Label>
        <Input
          id="house-gate-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Ana"
          required
          autoFocus
        />
        <p className="text-[13px] leading-snug text-muted-foreground">{hint}</p>
      </div>
      <Button type="submit" disabled={pending || !name.trim()}>
        {pending ? "Continuing…" : submitLabel}
      </Button>
      {onBack ? (
        <button
          type="button"
          className="text-action text-[15px]"
          onClick={onBack}
        >
          Pick from the list instead
        </button>
      ) : null}
      <button
        type="button"
        className="text-action text-[15px]"
        onClick={guestLink}
      >
        Join as a guest
      </button>
    </form>
  )
}

function GuestMode({
  guests,
  pending,
  onClaimGuest,
  onJoinGuest,
  onBack,
}: {
  guests: HouseMemberDto[]
  pending: boolean
  onClaimGuest: (memberId: string) => void
  onJoinGuest: (name: string) => void
  onBack: () => void
}) {
  const [name, setName] = useState("")

  return (
    <div className="flex flex-col gap-4">
      {guests.length > 0 ? (
        <>
          <p className="group-label">Join as a guest</p>
          <ul className="group-list">
            {guests.map((member) => (
              <li key={member.id}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => onClaimGuest(member.id)}
                  className="group-row-hit w-full text-left disabled:opacity-50"
                >
                  <span className="flex-1 text-[15px] font-medium">
                    {member.name}
                  </span>
                  <HugeiconsIcon
                    icon={ArrowRight01Icon}
                    size={16}
                    strokeWidth={2}
                    className="text-muted-foreground/60"
                  />
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          const trimmed = name.trim()
          if (!trimmed) return
          onJoinGuest(trimmed)
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="house-guest-name">Your name</Label>
          <Input
            id="house-guest-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Sofi"
            required
          />
          <p className="text-[13px] leading-snug text-muted-foreground">
            Guests see the house and mark what they paid.
          </p>
        </div>
        <Button type="submit" disabled={pending || !name.trim()}>
          {pending ? "Continuing…" : "Join as a guest"}
        </Button>
      </form>

      <button
        type="button"
        className="text-action text-[15px]"
        onClick={onBack}
      >
        Back
      </button>
    </div>
  )
}
