"use client";

import { useEffect, useState } from "react";
import { formatPhone } from "@/lib/phone";
import { KeypadIcon, MicIcon, MicOffIcon, PhoneIcon, PhoneOffIcon, XIcon } from "../icons";
import { cx } from "../ui";
import { useDialer } from "./dialer-provider";
import { WrapUpDialog } from "./wrap-up-dialog";

export function useElapsed(startedAt?: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [startedAt]);
  if (!startedAt) return null;
  const s = Math.max(0, Math.floor((now - startedAt) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

export function CallPanel({ isAdmin = false }: { isAdmin?: boolean }) {
  const { active, incoming, accept, reject, hangup, toggleMute, sendDigit, callError, clearCallError, wrapUp } = useDialer();
  // Keypad open state is remembered per call (keyed by start), so a new call starts closed.
  const [keypadFor, setKeypadFor] = useState<string | null>(null);
  const callKey = active ? `${active.direction}:${active.number}` : null;
  const keypad = keypadFor !== null && keypadFor === callKey;
  const setKeypad = (fn: (v: boolean) => boolean) => setKeypadFor(fn(keypad) ? callKey : null);
  const elapsed = useElapsed(active?.startedAt);

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex flex-col items-end gap-3 p-4 sm:bottom-4 sm:right-4 sm:left-auto sm:p-0">
        {callError && (
          <div role="alert" className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border border-coral-tint bg-white p-4 shadow-pop">
            <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-coral" />
            <p className="flex-1 text-sm text-black">{callError}</p>
            <button onClick={clearCallError} className="text-ash hover:text-black" aria-label="Dismiss">
              <XIcon size={16} />
            </button>
          </div>
        )}

        {incoming && !active && (
          <div className="pointer-events-auto w-full max-w-sm rounded-2xl bg-black p-5 text-white shadow-pop" role="alertdialog" aria-label="Incoming call">
            <p className="text-[13px] text-white/60">Incoming call</p>
            <p className="mt-1 font-display text-lg font-semibold">{incoming.label}</p>
            {incoming.label !== formatPhone(incoming.number) && <p className="text-sm text-white/60">{formatPhone(incoming.number)}</p>}
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button onClick={reject} className="flex h-11 items-center justify-center gap-2 rounded-full bg-white/10 text-sm font-medium hover:bg-white/15">
                <PhoneOffIcon size={17} /> Decline
              </button>
              <button onClick={accept} className="ring-pulse flex h-11 items-center justify-center gap-2 rounded-full bg-positive text-sm font-medium text-white">
                <PhoneIcon size={17} /> Answer
              </button>
            </div>
          </div>
        )}

        {active && (
          <div className="pointer-events-auto w-full max-w-sm rounded-2xl bg-black p-5 text-white shadow-pop" aria-live="polite">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] text-white/60">
                  {active.state === "connecting"
                    ? active.direction === "outbound"
                      ? "Calling…"
                      : "Connecting…"
                    : active.state === "ringing"
                      ? "Ringing…"
                      : active.state === "reconnecting"
                        ? "Reconnecting…"
                        : `On call · ${elapsed ?? "0:00"}`}
                </p>
                <p className="mt-1 truncate font-display text-lg font-semibold">{active.label}</p>
                {active.label !== formatPhone(active.number) && <p className="text-sm text-white/60">{formatPhone(active.number)}</p>}
              </div>
              {active.state === "open" && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-positive" aria-hidden />}
            </div>

            {keypad && (
              <div className="mt-4 grid grid-cols-3 gap-2">
                {KEYS.map((k) => (
                  <button key={k} onClick={() => sendDigit(k)} className="h-11 rounded-xl bg-white/10 text-lg font-medium hover:bg-white/15">
                    {k}
                  </button>
                ))}
              </div>
            )}

            <div className="mt-5 flex items-center gap-2">
              <button
                onClick={toggleMute}
                aria-pressed={active.muted}
                className={cx(
                  "flex h-11 flex-1 items-center justify-center gap-2 rounded-full text-sm font-medium",
                  active.muted ? "bg-white text-black" : "bg-white/10 hover:bg-white/15",
                )}
              >
                {active.muted ? <MicOffIcon size={17} /> : <MicIcon size={17} />}
                {active.muted ? "Muted" : "Mute"}
              </button>
              <button
                onClick={() => setKeypad((v) => !v)}
                aria-pressed={keypad}
                aria-label="Keypad"
                className={cx("flex h-11 w-11 items-center justify-center rounded-full", keypad ? "bg-white text-black" : "bg-white/10 hover:bg-white/15")}
              >
                <KeypadIcon size={17} />
              </button>
              <button onClick={hangup} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-coral text-sm font-medium text-black">
                <PhoneOffIcon size={17} /> Hang up
              </button>
            </div>
          </div>
        )}
      </div>
      {wrapUp && <WrapUpDialog key={`${wrapUp.callSid ?? wrapUp.logId ?? wrapUp.number}`} isAdmin={isAdmin} />}
    </>
  );
}
