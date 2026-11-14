import { useCallback, useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import type { IconSvgElement } from "@hugeicons/react"
import {
  Airplane01Icon,
  Home01Icon,
  Restaurant01Icon,
} from "@hugeicons/core-free-icons"

import { PageShell } from "@/components/page-shell"
import { SiteLogo } from "@/components/site-logo"
import { ThemeToggle } from "@/components/theme-toggle"
import { openAuthModal } from "@/lib/auth-modal"
import { rememberKind } from "@/lib/landing-prefs"
import { parseRoomKind, roomKindNoun } from "@/lib/room-kind"
import type { RoomKind } from "@/lib/room-kind"
import { cn } from "@/lib/utils"

/** Time each slide stays up before the next one slides in. */
const SLIDE_MS = 5000

type Slide = {
  kind: RoomKind
  label: string
  icon: IconSvgElement
  title: string
  body: string
  preview: ReactNode
}

const SLIDES: Slide[] = [
  {
    kind: "DINNER",
    label: "Bill",
    icon: Restaurant01Icon,
    title: "Scan the ticket. Tap who had what.",
    body: "Everyone sees what they owe before the check comes back.",
    preview: <BillPreview />,
  },
  {
    kind: "TRIP",
    label: "Trip",
    icon: Airplane01Icon,
    title: "One code for the whole trip.",
    body: "Friends join with the code, log what they paid, and settle once at the end.",
    preview: <TripPreview />,
  },
  {
    kind: "HOUSEHOLD",
    label: "House",
    icon: Home01Icon,
    title: "Rent, groceries and the rest.",
    body: "A running balance with the people you live with, month after month.",
    preview: <HousePreview />,
  },
]

export type SplashInvite = {
  code: string
  name: string
  kind?: RoomKind | string
}

type OnboardingSplashProps = {
  /** Opened from an invite link: auth returns to that room. */
  invite?: SplashInvite
  /** Where auth returns from the home screen (defaults to the landing). */
  redirect?: string
}

/** Everything needs an account, so the splash only leads into auth. */
export function OnboardingSplash({ invite, redirect }: OnboardingSplashProps) {
  const inviteKind = invite ? parseRoomKind(invite.kind ?? "TRIP") : null
  const initial = Math.max(
    0,
    SLIDES.findIndex((slide) => slide.kind === inviteKind)
  )

  const viewportRef = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(initial)
  /** Finger or mouse offset while dragging, in px; 0 when settled. */
  const [drag, setDrag] = useState(0)
  const dragRef = useRef<{
    id: number
    x: number
    y: number
    at: number
    /** null until the gesture reads as horizontal (true) or vertical (false). */
    horizontal: boolean | null
  } | null>(null)
  /** Plays until the visitor touches, swipes, scrolls or picks a slide. */
  const [autoplay, setAutoplay] = useState(true)
  const [hidden, setHidden] = useState(false)
  const reducedMotion = usePrefersReducedMotion()
  const playing = autoplay && !reducedMotion

  // The index is the only source of truth: the track follows it with a
  // transform, so no browser scroll or snap can pull it back.
  const goTo = useCallback((next: number) => {
    setIndex(((next % SLIDES.length) + SLIDES.length) % SLIDES.length)
  }, [])
  /** Manual moves stop at the ends; only autoplay wraps around. */
  const step = useCallback((delta: number) => {
    setIndex((current) =>
      Math.min(SLIDES.length - 1, Math.max(0, current + delta))
    )
  }, [])

  const stopAutoplay = useCallback(() => setAutoplay(false), [])

  useEffect(() => {
    const sync = () => setHidden(document.hidden)
    document.addEventListener("visibilitychange", sync)
    return () => document.removeEventListener("visibilitychange", sync)
  }, [])

  useEffect(() => {
    if (!playing || hidden) return
    const timer = window.setTimeout(
      () => setIndex((current) => (current + 1) % SLIDES.length),
      SLIDE_MS
    )
    return () => window.clearTimeout(timer)
  }, [playing, hidden, index])

  // Trackpad and horizontal wheel: one slide per flick. Native listener so it
  // can stop the browser's swipe-to-go-back.
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    let accumulated = 0
    let lockedUntil = 0
    function onWheel(event: WheelEvent) {
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return
      event.preventDefault()
      setAutoplay(false)
      const now = performance.now()
      if (now < lockedUntil) return
      accumulated += event.deltaX
      if (Math.abs(accumulated) < 40) return
      step(accumulated > 0 ? 1 : -1)
      accumulated = 0
      lockedUntil = now + 650
    }
    viewport.addEventListener("wheel", onWheel, { passive: false })
    return () => viewport.removeEventListener("wheel", onWheel)
  }, [step])

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return
    stopAutoplay()
    dragRef.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      at: performance.now(),
      horizontal: null,
    }
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const gesture = dragRef.current
    if (!gesture || gesture.id !== event.pointerId) return
    const dx = event.clientX - gesture.x
    const dy = event.clientY - gesture.y
    if (gesture.horizontal === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
      gesture.horizontal = Math.abs(dx) > Math.abs(dy)
      if (gesture.horizontal) {
        event.currentTarget.setPointerCapture(event.pointerId)
      }
    }
    if (!gesture.horizontal) return
    const atEdge =
      (index === 0 && dx > 0) || (index === SLIDES.length - 1 && dx < 0)
    setDrag(atEdge ? dx * 0.3 : dx)
  }

  function endDrag(event: React.PointerEvent<HTMLDivElement>) {
    const gesture = dragRef.current
    if (!gesture || gesture.id !== event.pointerId) return
    dragRef.current = null
    if (gesture.horizontal) {
      const dx = event.clientX - gesture.x
      const width = event.currentTarget.clientWidth || 1
      const speed = Math.abs(dx) / Math.max(1, performance.now() - gesture.at)
      if (Math.abs(dx) > width * 0.18 || (Math.abs(dx) > 24 && speed > 0.45)) {
        step(dx < 0 ? 1 : -1)
      }
    }
    setDrag(0)
  }

  const slide = SLIDES[index]
  const noun = inviteKind ? roomKindNoun(inviteKind) : null
  const authRedirect = invite
    ? `/r/${invite.code}`
    : (redirect ??
      (slide.kind === "HOUSEHOLD" ? "/?stay=true&kind=house" : "/?stay=true"))

  /** One combined sign-in-or-up modal; the landing opens on this kind. */
  function startAuth() {
    stopAutoplay()
    rememberKind(slide.kind)
    openAuthModal({ redirect: authRedirect })
  }

  return (
    <PageShell
      width="narrow"
      className="overflow-hidden"
      innerClassName="flex h-[calc(100dvh-var(--site-notice-height,0px))] min-h-[34rem] flex-col pt-2"
    >
      <header className="flex h-11 items-center justify-between">
        <SiteLogo />
        <ThemeToggle />
      </header>

      {invite ? (
        <p
          data-enter
          className="animate-rise mt-4 self-start rounded-full bg-accent px-3.5 py-1.5 text-[13px] font-medium text-accent-foreground"
        >
          You&rsquo;re invited to{" "}
          <span className="font-semibold">{invite.name}</span>
        </p>
      ) : null}

      <section
        aria-roledescription="carousel"
        aria-label="What Split does"
        className="animate-rise mt-2 flex min-h-0 flex-1 flex-col"
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") {
            stopAutoplay()
            step(1)
          }
          if (event.key === "ArrowLeft") {
            stopAutoplay()
            step(-1)
          }
        }}
      >
        <div className="flex gap-1.5" role="tablist" aria-label="Kinds">
          {SLIDES.map((item, i) => (
            <button
              key={item.kind}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Show ${item.label}`}
              onClick={() => {
                stopAutoplay()
                goTo(i)
              }}
              className="flex h-11 flex-1 items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="relative h-1 w-full overflow-hidden rounded-full bg-foreground/12">
                <span
                  key={i === index && playing ? `play-${index}` : "still"}
                  className={cn(
                    "absolute inset-y-0 left-0 w-full rounded-full bg-foreground transition-opacity duration-200",
                    i > index && "opacity-0",
                    i === index && playing && "splash-progress"
                  )}
                  style={
                    i === index && playing
                      ? {
                          animationDuration: `${SLIDE_MS}ms`,
                          animationPlayState: hidden ? "paused" : "running",
                        }
                      : undefined
                  }
                />
              </span>
            </button>
          ))}
        </div>

        <div
          ref={viewportRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className="-mx-(--space-gutter) min-h-0 flex-1 touch-pan-y overflow-hidden overscroll-x-contain select-none"
        >
          <div
            className="flex h-full"
            style={{
              transform: `translate3d(calc(${index * -100}% + ${drag}px), 0, 0)`,
              transition:
                drag !== 0 || reducedMotion
                  ? "none"
                  : "transform 520ms var(--ease-out)",
            }}
          >
            {SLIDES.map((item, i) => (
              <article
                key={item.kind}
                role="tabpanel"
                aria-roledescription="slide"
                aria-label={`${i + 1} of ${SLIDES.length}: ${item.label}`}
                aria-hidden={i !== index}
                inert={i !== index}
                className="flex w-full shrink-0 flex-col px-(--space-gutter)"
              >
                {/* Sized container: the preview card scales to the room it gets. */}
                <div className="[container-type:size] flex min-h-0 flex-1 items-center justify-center overflow-hidden py-3">
                  {item.preview}
                </div>
                <div className="pb-2">
                  <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground">
                    <HugeiconsIcon
                      icon={item.icon}
                      size={16}
                      strokeWidth={1.8}
                    />
                    {item.label}
                  </span>
                  <h2 className="mt-1.5 font-display text-[26px] leading-[1.1] font-bold tracking-tight text-balance text-foreground">
                    {item.title}
                  </h2>
                  <p className="mt-2 text-[15px] leading-snug text-pretty text-muted-foreground">
                    {item.body}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <div className="pb-safe flex shrink-0 flex-col gap-2 pt-3 pb-4">
        <button
          type="button"
          onClick={startAuth}
          className="split-cta cta-lg w-full"
        >
          {invite ? `Sign in to join the ${noun}` : "Create an account"}
        </button>
        <p className="text-center text-[14px] text-muted-foreground">
          {invite ? "New to Split?" : "Already have one?"}{" "}
          <button
            type="button"
            onClick={startAuth}
            className="text-action inline-flex h-11 items-center font-semibold"
          >
            {invite ? "Create an account" : "Sign in"}
          </button>
        </p>
      </div>
    </PageShell>
  )
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)")
    const sync = () => setReduced(query.matches)
    sync()
    query.addEventListener("change", sync)
    return () => query.removeEventListener("change", sync)
  }, [])
  return reduced
}

/* ── Live previews: the real thing each mode shows, drawn in app styles. ── */

function PreviewCard({ children }: { children: ReactNode }) {
  return (
    <div
      aria-hidden
      className="splash-preview w-full max-w-[22rem] origin-center rounded-3xl bg-card p-4 shadow-[0_24px_60px_-28px_var(--shadow-color-strong)] ring-1 ring-foreground/8"
    >
      {children}
    </div>
  )
}

function Avatar({ name, tone }: { name: string; tone: number }) {
  const tones = [
    "bg-primary text-primary-foreground",
    "bg-foreground text-background",
    "bg-muted text-foreground",
  ]
  return (
    <span
      className={cn(
        "inline-flex size-6 items-center justify-center rounded-full text-[11px] font-semibold ring-2 ring-card",
        tones[tone % tones.length]
      )}
    >
      {name[0]}
    </span>
  )
}

function Row({
  left,
  right,
  sub,
}: {
  left: ReactNode
  right: ReactNode
  sub?: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <p className="truncate text-[14px] font-medium text-foreground">
          {left}
        </p>
        {sub ? (
          <div className="mt-1 flex items-center gap-1.5 text-[12px] text-muted-foreground">
            {sub}
          </div>
        ) : null}
      </div>
      <p className="shrink-0 text-[14px] font-semibold text-foreground tabular-nums">
        {right}
      </p>
    </div>
  )
}

function BillPreview() {
  return (
    <PreviewCard>
      <div className="flex items-baseline justify-between">
        <p className="font-display text-[15px] font-bold">Friday dinner</p>
        <p className="text-[12px] text-muted-foreground">4 people</p>
      </div>
      <div className="mt-2 divide-y divide-border/60">
        <Row
          left="Lasagna"
          right="$14.50"
          sub={
            <>
              <Avatar name="Ana" tone={0} /> Ana
            </>
          }
        />
        <Row
          left="Margherita pizza"
          right="$12.00"
          sub={
            <>
              <span className="flex -space-x-1.5">
                <Avatar name="Leo" tone={1} />
                <Avatar name="Sofi" tone={2} />
              </span>
              Leo, Sofi
            </>
          }
        />
        <Row
          left="Lemonade ×3"
          right="$7.50"
          sub={
            <span className="rounded-full bg-accent px-2 py-0.5 font-medium text-primary">
              Everyone
            </span>
          }
        />
      </div>
      <div className="mt-3 flex items-center justify-between rounded-2xl bg-muted px-3 py-2.5">
        <span className="text-[13px] text-muted-foreground">You owe</span>
        <span className="font-display text-[17px] font-bold tabular-nums">
          $16.38
        </span>
      </div>
    </PreviewCard>
  )
}

function TripPreview() {
  return (
    <PreviewCard>
      <div className="flex items-center justify-between">
        <p className="font-display text-[15px] font-bold">Beach weekend</p>
        <span className="rounded-full bg-foreground px-2.5 py-1 font-mono text-[12px] font-semibold tracking-widest text-background">
          BEACH7
        </span>
      </div>
      <div className="mt-2 divide-y divide-border/60">
        <Row
          left="Cabin, 2 nights"
          right="$420.00"
          sub={
            <>
              <Avatar name="Ana" tone={0} /> Ana paid
            </>
          }
        />
        <Row
          left="Gas"
          right="$60.00"
          sub={
            <>
              <Avatar name="Leo" tone={1} /> Leo paid
            </>
          }
        />
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-2xl bg-muted px-3 py-2.5 text-[13px]">
        <Avatar name="Sofi" tone={2} />
        <span className="text-muted-foreground">Sofi pays Ana</span>
        <span className="ml-auto font-display text-[17px] font-bold tabular-nums">
          $160.00
        </span>
      </div>
    </PreviewCard>
  )
}

function HousePreview() {
  return (
    <PreviewCard>
      <div className="flex items-baseline justify-between">
        <p className="font-display text-[15px] font-bold">Casa Escalón</p>
        <p className="text-[12px] text-muted-foreground">November</p>
      </div>
      <div className="mt-2 divide-y divide-border/60">
        <Row
          left="Rent"
          right="$1,200.00"
          sub={<span>Split 3 ways · due on the 1st</span>}
        />
        <Row
          left="Groceries"
          right="$186.40"
          sub={
            <>
              <Avatar name="Leo" tone={1} /> Leo paid
            </>
          }
        />
        <Row left="Internet" right="$45.00" sub={<span>Every month</span>} />
      </div>
      <div className="mt-3 rounded-2xl bg-muted px-3 py-2.5">
        <div className="flex items-center justify-between text-[13px]">
          <span className="text-muted-foreground">You&rsquo;re owed</span>
          <span className="font-display text-[17px] font-bold tabular-nums">
            $84.20
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-foreground/10">
          <div className="h-full w-2/3 rounded-full bg-primary" />
        </div>
      </div>
    </PreviewCard>
  )
}
