"use client";

import { PhoneIcon } from "../icons";
import { Button } from "../ui";
import { useDialer } from "./dialer-provider";

export function CallButton({
  number,
  contactId,
  label,
  size = "md",
  compact = false,
}: {
  number: string;
  contactId?: string;
  label?: string;
  size?: "sm" | "md" | "lg";
  compact?: boolean;
}) {
  const { dial, active, deviceState } = useDialer();
  const busy = Boolean(active);
  return (
    <Button
      variant="call"
      size={size}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        dial(number, { contactId, label });
      }}
      disabled={busy || deviceState !== "ready"}
      title={deviceState !== "ready" ? "Dialer not connected" : busy ? "Already on a call" : `Call ${label ?? number}`}
      aria-label={`Call ${label ?? number}`}
      className={compact ? "px-0! w-8" : undefined}
    >
      <PhoneIcon size={size === "sm" ? 15 : 17} />
      {!compact && "Call"}
    </Button>
  );
}
