import { PageShell } from "@/components/page-shell"
import { SiteLogo } from "@/components/site-logo"
import { MemberIdentityPicker } from "@/components/member-identity-picker"
import type { MemberIdentityPickerProps } from "@/components/member-identity-picker"

type WhoAreYouGateProps = MemberIdentityPickerProps & {
  roomName: string
  roomCode: string
}

function WhoAreYouGate({
  roomName,
  roomCode,
  ...pickerProps
}: WhoAreYouGateProps) {
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
        <span className="font-medium text-foreground">{roomName}</span> (
        <span className="font-display tracking-widest">{roomCode}</span>).
        Pick your name to continue on this device — no account needed.
      </p>

      <div className="mt-6">
        <MemberIdentityPicker {...pickerProps} />
      </div>
    </PageShell>
  )
}

export { WhoAreYouGate }
export type { WhoAreYouGateProps }
