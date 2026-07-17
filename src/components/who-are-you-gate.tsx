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
      width="narrow"
      className="overflow-hidden"
      innerClassName="flex min-h-dvh flex-col justify-center py-10"
      stippleClassName="opacity-30"
    >
      <SiteLogo />
      <h1 className="mt-6 font-display text-4xl font-semibold tracking-tight">
        Who are you?
      </h1>
      <p className="mt-3 text-base text-muted-foreground">
        You&rsquo;re in{" "}
        <span className="font-medium text-foreground">{roomName}</span> (
        <span className="font-display tracking-widest">{roomCode}</span>).
        Pick your name to continue on this device — no account needed.
      </p>

      <div className="mt-8">
        <MemberIdentityPicker {...pickerProps} />
      </div>
    </PageShell>
  )
}

export { WhoAreYouGate }
export type { WhoAreYouGateProps }
