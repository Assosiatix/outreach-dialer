"use client";

import type { Call, Device } from "@twilio/voice-sdk";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { explainTwilioError } from "@/lib/call-status";

export type Availability = "online" | "away";
export type DeviceState = "loading" | "ready" | "error" | "unconfigured";

export type ActiveCall = {
  direction: "inbound" | "outbound";
  number: string;
  label: string;
  contactId?: string;
  logId?: string;
  callSid?: string;
  state: "connecting" | "ringing" | "open" | "reconnecting";
  startedAt?: number; // when the call was answered
  muted: boolean;
};

export type IncomingCall = { number: string; label: string; contactId?: string; logId?: string };

export type WrapUp = {
  direction: "inbound" | "outbound";
  number: string;
  label: string;
  contactId?: string;
  logId?: string;
  callSid?: string;
  durationSec: number;
  connected: boolean;
};

type DialOptions = { contactId?: string; label?: string; callerId?: string };

type Ctx = {
  deviceState: DeviceState;
  deviceError: string | null;
  availability: Availability;
  setAvailability: (a: Availability) => void;
  active: ActiveCall | null;
  incoming: IncomingCall | null;
  wrapUp: WrapUp | null;
  callError: string | null;
  dial: (number: string, opts?: DialOptions) => Promise<void>;
  hangup: () => void;
  toggleMute: () => void;
  sendDigit: (d: string) => void;
  accept: () => void;
  reject: () => void;
  dismissWrapUp: () => void;
  clearCallError: () => void;
  retryDevice: () => void;
};

const DialerContext = createContext<Ctx | null>(null);

export function useDialer() {
  const c = useContext(DialerContext);
  if (!c) throw new Error("useDialer must be used inside <DialerProvider>");
  return c;
}

async function fetchToken(): Promise<{ token: string; edge?: string } | { error: string; status: number }> {
  const res = await fetch("/api/token", { method: "POST" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { error: data.error ?? "Could not get a calling token", status: res.status };
  return data;
}

function describe(err: unknown): string {
  const e = err as { code?: number; message?: string; description?: string };
  return explainTwilioError(e?.code) ?? e?.description ?? e?.message ?? "Call error";
}

const AVAIL_KEY = "od_availability";

export function DialerProvider({ children }: { children: ReactNode }) {
  const [deviceState, setDeviceState] = useState<DeviceState>("loading");
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [availability, setAvailabilityState] = useState<Availability>("online");
  const [active, setActive] = useState<ActiveCall | null>(null);
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  const [wrapUp, setWrapUp] = useState<WrapUp | null>(null);
  const [callError, setCallError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const deviceRef = useRef<Device | null>(null);
  const callRef = useRef<Call | null>(null);
  const incomingRef = useRef<Call | null>(null);
  const activeRef = useRef<ActiveCall | null>(null);
  activeRef.current = active;
  const connectingRef = useRef(false);
  const hangupRequestedRef = useRef(false);

  // ── presence ────────────────────────────────────────────────────────────
  const presence = useMemo(() => {
    if (deviceState !== "ready") return "offline" as const;
    if (active) return "on_call" as const;
    return availability;
  }, [deviceState, active, availability]);

  const presenceRef = useRef(presence);
  presenceRef.current = presence;

  const postPresence = useCallback((status: string) => {
    fetch("/api/presence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
      keepalive: true,
    }).catch(() => {});
  }, []);

  useEffect(() => {
    postPresence(presence);
  }, [presence, postPresence]);

  useEffect(() => {
    const t = setInterval(() => postPresence(presenceRef.current), 20_000);
    const bye = () => navigator.sendBeacon("/api/presence/offline");
    window.addEventListener("pagehide", bye);
    return () => {
      clearInterval(t);
      window.removeEventListener("pagehide", bye);
    };
  }, [postPresence]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(AVAIL_KEY);
      // Restored after mount (not in useState init) so server and client HTML match.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved === "away" || saved === "online") setAvailabilityState(saved);
    } catch {}
  }, []);

  const setAvailability = useCallback((a: Availability) => {
    setAvailabilityState(a);
    try {
      localStorage.setItem(AVAIL_KEY, a);
    } catch {}
  }, []);

  // ── call wiring ─────────────────────────────────────────────────────────
  const finishedRef = useRef(new WeakSet<Call>());
  const finishCall = useCallback((call: Call) => {
    // disconnect / cancel / reject can all fire for one call — handle it once.
    if (finishedRef.current.has(call)) return;
    finishedRef.current.add(call);
    const a = activeRef.current;
    if (callRef.current === call) callRef.current = null;
    const callSid = a?.callSid ?? call.parameters?.CallSid;
    if (a && a.direction === "outbound" && !callSid && !a.startedAt && a.state === "connecting") {
      // Twilio never reported the call (no ringing, no CallSid): it didn't really start.
      setCallError(
        (prev) =>
          prev ??
          "The call didn't start. Check that the microphone is allowed, and that Twilio can reach this app (Numbers → Configure webhooks after the tunnel URL changes).",
      );
      setActive(null);
      return;
    }
    if (a) {
      const durationSec = a.startedAt ? Math.round((Date.now() - a.startedAt) / 1000) : 0;
      setWrapUp({
        direction: a.direction,
        number: a.number,
        label: a.label,
        contactId: a.contactId,
        logId: a.logId,
        callSid: a.callSid ?? call.parameters?.CallSid,
        durationSec,
        connected: Boolean(a.startedAt),
      });
    }
    setActive(null);
  }, []);

  const wireActiveCall = useCallback(
    (call: Call) => {
      callRef.current = call;
      call.on("ringing", () =>
        setActive((a) => (a ? { ...a, state: "ringing", callSid: a.callSid ?? call.parameters?.CallSid } : a)),
      );
      call.on("accept", () =>
        setActive((a) =>
          a ? { ...a, state: "open", callSid: a.callSid ?? call.parameters?.CallSid, startedAt: a.startedAt ?? Date.now() } : a,
        ),
      );
      call.on("reconnecting", () => setActive((a) => (a ? { ...a, state: "reconnecting" } : a)));
      call.on("reconnected", () => setActive((a) => (a ? { ...a, state: "open" } : a)));
      call.on("mute", (muted: boolean) => setActive((a) => (a ? { ...a, muted } : a)));
      call.on("disconnect", () => finishCall(call));
      call.on("cancel", () => finishCall(call));
      call.on("reject", () => finishCall(call));
      call.on("error", (err: unknown) => setCallError(describe(err)));
    },
    [finishCall],
  );

  // ── device lifecycle ────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    let device: Device | null = null;

    (async () => {
      setDeviceState("loading");
      setDeviceError(null);
      const tok = await fetchToken();
      if (cancelled) return;
      if ("error" in tok) {
        setDeviceState(tok.status === 503 ? "unconfigured" : "error");
        setDeviceError(tok.error);
        return;
      }
      const { Device, Call } = await import("@twilio/voice-sdk");
      if (cancelled) return;
      device = new Device(tok.token, {
        codecPreferences: [Call.Codec.Opus, Call.Codec.PCMU],
        closeProtection: "A call is in progress. Leaving will hang up.",
        edge: tok.edge || "roaming",
        logLevel: "warn",
      });
      deviceRef.current = device;

      device.on("registered", () => {
        setDeviceState("ready");
        setDeviceError(null);
      });
      device.on("unregistered", () => setDeviceState((s) => (s === "ready" ? "loading" : s)));
      device.on("error", (err: { code?: number }) => {
        const msg = describe(err);
        // Token problems are recoverable: fetch a fresh one.
        if ([20101, 20104, 31204, 31205].includes(Number(err?.code))) {
          fetchToken().then((t) => "token" in t && device?.updateToken(t.token));
        }
        if (callRef.current) setCallError(msg);
        else {
          setDeviceError(msg);
        }
      });
      device.on("tokenWillExpire", async () => {
        const t = await fetchToken();
        if ("token" in t) device?.updateToken(t.token);
      });
      device.on("incoming", (call: Call) => {
        if (callRef.current || incomingRef.current) {
          call.reject(); // already busy — Twilio rings the teammate / goes to voicemail
          return;
        }
        incomingRef.current = call;
        const p = call.customParameters;
        const number = call.parameters?.From ?? "";
        const info: IncomingCall = {
          number,
          label: p.get("label") ?? number,
          contactId: p.get("contactId") ?? undefined,
          logId: p.get("logId") ?? undefined,
        };
        setIncoming(info);
        const clear = () => {
          if (incomingRef.current === call) {
            incomingRef.current = null;
            setIncoming(null);
          }
        };
        call.on("cancel", clear);
        call.on("reject", clear);
        call.on("disconnect", clear);
        if (document.hidden && "Notification" in window && Notification.permission === "granted") {
          const n = new Notification("Incoming call", { body: info.label, tag: "od-incoming", requireInteraction: true });
          n.onclick = () => {
            window.focus();
            n.close();
          };
          call.on("cancel", () => n.close());
          call.on("accept", () => n.close());
        }
      });

      try {
        await device.register();
      } catch (err) {
        if (!cancelled) {
          setDeviceState("error");
          setDeviceError(describe(err));
        }
      }
    })();

    return () => {
      cancelled = true;
      device?.destroy();
      deviceRef.current = null;
    };
  }, [attempt]);

  // Ask once for notification permission so incoming calls can alert a background tab.
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      const ask = () => {
        Notification.requestPermission().catch(() => {});
        window.removeEventListener("click", ask);
      };
      window.addEventListener("click", ask);
      return () => window.removeEventListener("click", ask);
    }
  }, []);

  // Flash the tab title while ringing.
  useEffect(() => {
    if (!incoming) return;
    const original = document.title;
    let on = false;
    const t = setInterval(() => {
      document.title = (on = !on) ? `📞 ${incoming.label}` : original;
    }, 900);
    return () => {
      clearInterval(t);
      document.title = original;
    };
  }, [incoming]);

  // ── actions ─────────────────────────────────────────────────────────────
  const dial = useCallback(
    async (number: string, opts: DialOptions = {}) => {
      const device = deviceRef.current;
      setCallError(null);
      if (!device || deviceState !== "ready") {
        setCallError(deviceError ?? "Dialer is still connecting. Try again in a moment.");
        return;
      }
      // activeRef/connectingRef also cover the moment before device.connect() resolves,
      // so a double-click can't start two calls.
      if (callRef.current || activeRef.current || connectingRef.current) {
        setCallError("Finish the current call first.");
        return;
      }
      connectingRef.current = true;
      hangupRequestedRef.current = false;
      setWrapUp(null);
      const pending: ActiveCall = {
        direction: "outbound",
        number,
        label: opts.label ?? number,
        contactId: opts.contactId,
        state: "connecting",
        muted: false,
      };
      activeRef.current = pending;
      setActive(pending);
      try {
        const params: Record<string, string> = { To: number };
        if (opts.contactId) params.contactId = opts.contactId;
        if (opts.callerId) params.callerId = opts.callerId;
        const call = await device.connect({ params });
        wireActiveCall(call);
        // Hang up was pressed while we were still connecting: end it now instead of leaving
        // an invisible call ringing.
        if (hangupRequestedRef.current) call.disconnect();
      } catch (err) {
        activeRef.current = null;
        setActive(null);
        setCallError(describe(err));
      } finally {
        connectingRef.current = false;
      }
    },
    [deviceState, deviceError, wireActiveCall],
  );

  const accept = useCallback(() => {
    const call = incomingRef.current;
    if (!call || !incoming) return;
    incomingRef.current = null;
    setIncoming(null);
    setWrapUp(null);
    setActive({
      direction: "inbound",
      number: incoming.number,
      label: incoming.label,
      contactId: incoming.contactId,
      logId: incoming.logId,
      state: "connecting",
      muted: false,
    });
    wireActiveCall(call);
    call.accept();
  }, [incoming, wireActiveCall]);

  const reject = useCallback(() => {
    incomingRef.current?.reject();
    incomingRef.current = null;
    setIncoming(null);
  }, []);

  const hangup = useCallback(() => {
    const call = callRef.current;
    if (call) call.disconnect();
    else if (connectingRef.current) hangupRequestedRef.current = true; // disconnect once connect() resolves
    else setActive(null);
  }, []);

  const toggleMute = useCallback(() => {
    const call = callRef.current;
    if (call) call.mute(!call.isMuted());
  }, []);

  const sendDigit = useCallback((d: string) => callRef.current?.sendDigits(d), []);

  const value: Ctx = {
    deviceState,
    deviceError,
    availability,
    setAvailability,
    active,
    incoming,
    wrapUp,
    callError,
    dial,
    hangup,
    toggleMute,
    sendDigit,
    accept,
    reject,
    dismissWrapUp: () => setWrapUp(null),
    clearCallError: () => setCallError(null),
    retryDevice: () => setAttempt((n) => n + 1),
  };

  return <DialerContext.Provider value={value}>{children}</DialerContext.Provider>;
}
