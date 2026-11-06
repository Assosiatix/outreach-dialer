import type { CallDirection, CallStatus } from "@prisma/client";
import { STATUS_LABEL } from "@/lib/call-status";
import { PhoneIncomingIcon, PhoneOutgoingIcon } from "./icons";
import { Badge } from "./ui";

export function CallStatusBadge({ status }: { status: CallStatus }) {
  const tone =
    status === "completed"
      ? "positive"
      : status === "missed" || status === "voicemail" || status === "failed"
        ? "coral"
        : status === "in_progress" || status === "ringing" || status === "initiated"
          ? "dark"
          : "neutral";
  return <Badge tone={tone}>{STATUS_LABEL[status]}</Badge>;
}

export function DirectionIcon({ direction, status }: { direction: CallDirection; status?: CallStatus }) {
  const bad = status === "missed" || status === "voicemail";
  const Icon = direction === "inbound" ? PhoneIncomingIcon : PhoneOutgoingIcon;
  return (
    <span
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${bad ? "bg-coral-soft text-coral-ink" : "bg-black/[0.05] text-graphite"}`}
      title={direction === "inbound" ? "Inbound" : "Outbound"}
    >
      <Icon size={15} />
    </span>
  );
}

export function RecordingPlayer({ callId }: { callId: string }) {
  return (
    <audio controls preload="none" className="h-10 w-full max-w-md" src={`/api/recordings/${callId}`}>
      Your browser can&apos;t play this recording.
    </audio>
  );
}
