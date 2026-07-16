import { SiteLogo } from "@/components/site-logo"
import { SplitAtmosphere } from "@/components/split-atmosphere"
import {
  MemberIdentityPicker,
  type MemberIdentityPickerProps,
} from "@/components/member-identity-picker"

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
    <SplitAtmosphere
      as="main"
      className="overflow-hidden"
      stippleClassName="opacity-30"
    >
      <div className="page-gutter relative mx-auto flex min-h-dvh max-w-narrow flex-col justify-center py-10">
        <SiteLogo />
        <h1 className="font-display mt-6 text-4xl font-semibold tracking-tight">
          Who are you?
        </h1>
        <p className="text-muted-foreground mt-3 text-base">
          You&rsquo;re in{" "}
          <span className="text-foreground font-medium">{roomName}</span>{" "}
          (<span className="font-display tracking-widest">{roomCode}</span>). Pick
          your name to continue on this device — no account needed.
        </p>

        <div className="mt-8">
          <MemberIdentityPicker {...pickerProps} />
        </div>
      </div>
    </SplitAtmosphere>
  )
}

export { WhoAreYouGate }
export type { WhoAreYouGateProps }
