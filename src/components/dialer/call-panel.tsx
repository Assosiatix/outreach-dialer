"use client";

import { useEffect, useState } from "react";
import { countryName, countryOf, flag, formatPhone } from "@/lib/phone";
import { KeypadIcon, MicIcon, MicOffIcon, PhoneIcon, PhoneOffIcon, XIcon } from "../icons";
import { cx } from "../ui";
import { type ActiveCall, useDialer } from "./dialer-provider";
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
          <ActiveCallCard
            key={callKey}
            active={active}
            elapsed={elapsed}
            keypad={keypad}
            onToggleKeypad={() => setKeypad((v) => !v)}
            onMute={toggleMute}
            onDigit={sendDigit}
            onHangup={hangup}
          />
        )}
      </div>
      {wrapUp && <WrapUpDialog key={`${wrapUp.callSid ?? wrapUp.logId ?? wrapUp.number}`} isAdmin={isAdmin} />}
    </>
  );
}

function statusText(active: ActiveCall) {
  switch (active.state) {
    case "connecting":
      return active.direction === "outbound" ? "Calling…" : "Connecting…";
    case "ringing":
      return "Ringing…";
    case "reconnecting":
      return "Reconnecting…";
    default:
      return active.muted ? "On call · muted" : "On call";
  }
}

/** Round control with its label underneath — labels never wrap, whatever the panel width. */
function Control({
  label,
  onClick,
  pressed,
  tone = "default",
  children,
}: {
  label: string;
  onClick: () => void;
  pressed?: boolean;
  tone?: "default" | "end";
  children: React.ReactNode;
}) {
  return (
    <button onClick={onClick} aria-pressed={pressed} aria-label={label} className="group flex flex-col items-center gap-1.5">
      <span
        className={cx(
          "flex h-13 w-13 items-center justify-center rounded-full transition-colors",
          tone === "end"
            ? "bg-coral text-black group-hover:brightness-95"
            : pressed
              ? "bg-white text-black"
              : "bg-white/10 text-white group-hover:bg-white/18",
        )}
      >
        {children}
      </span>
      <span className="text-xs whitespace-nowrap text-white/70">{label}</span>
    </button>
  );
}

function ActiveCallCard({
  active,
  elapsed,
  keypad,
  onToggleKeypad,
  onMute,
  onDigit,
  onHangup,
}: {
  active: ActiveCall;
  elapsed: string | null;
  keypad: boolean;
  onToggleKeypad: () => void;
  onMute: () => void;
  onDigit: (d: string) => void;
  onHangup: () => void;
}) {
  // Digits sent during this call (e.g. an extension) — the card is keyed per call, so this resets.
  const [digits, setDigits] = useState("");
  const live = active.state === "open";
  const phone = formatPhone(active.number);
  const country = countryOf(active.number);
  const sub = [active.label !== phone ? phone : null, country ? countryName(country) : null].filter(Boolean).join(" · ");

  return (
    <div className="pointer-events-auto w-full rounded-3xl bg-black p-5 text-white shadow-pop sm:w-85" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <span
          className={cx(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
            live ? "bg-positive/20 text-[oklch(0.82_0.11_158)]" : "bg-white/10 text-white/70",
          )}
        >
          <span className={cx("h-1.5 w-1.5 rounded-full", live ? "bg-positive" : "animate-pulse bg-white/60")} aria-hidden />
          {statusText(active)}
        </span>
        <span className="font-display text-lg font-semibold tabular-nums">{live ? (elapsed ?? "0:00") : ""}</span>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-xl" aria-hidden>
          {country ? flag(country) : <PhoneIcon size={18} />}
        </span>
        <div className="min-w-0">
          <p className="truncate font-display text-lg leading-tight font-semibold">{active.label}</p>
          {sub && <p className="mt-0.5 truncate text-[13px] text-white/60">{sub}</p>}
        </div>
      </div>

      {keypad && (
        <div className="mt-4 rounded-2xl bg-white/5 p-3">
          <p className="mb-2 h-6 truncate text-center font-display text-lg tracking-widest tabular-nums" aria-live="polite">
            {digits || <span className="text-sm tracking-normal text-white/40">Type an extension</span>}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {KEYS.map((k) => (
              <button
                key={k}
                onClick={() => {
                  onDigit(k);
                  setDigits((d) => (d + k).slice(-24));
                }}
                className="h-10 rounded-xl bg-white/10 text-lg font-medium hover:bg-white/15"
              >
                {k}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 grid grid-cols-3 border-t border-white/10 pt-4">
        <Control label={active.muted ? "Unmute" : "Mute"} onClick={onMute} pressed={active.muted}>
          {active.muted ? <MicOffIcon size={20} /> : <MicIcon size={20} />}
        </Control>
        <Control label="Keypad" onClick={onToggleKeypad} pressed={keypad}>
          <KeypadIcon size={20} />
        </Control>
        <Control label="End call" onClick={onHangup} tone="end">
          <PhoneOffIcon size={20} />
        </Control>
      </div>
    </div>
  );
}
