"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { logout } from "@/app/login/actions";
import { CallPanel } from "./dialer/call-panel";
import { DialerProvider, useDialer } from "./dialer/dialer-provider";
import {
  BuildingIcon,
  ChartIcon,
  HistoryIcon,
  HomeIcon,
  KeypadIcon,
  LogoutIcon,
  PhoneIcon,
  UsersIcon,
  WalletIcon,
  XIcon,
} from "./icons";
import { cx } from "./ui";

type Me = { id: string; name: string; email: string; role: "admin" | "caller" };
type Summary = { team: { id: string; name: string; status: string }[]; dueFollowUps: number; unhandled: number };

type Mode = { outboundOnly: boolean; callerId: string | null };

export function AppShell({ me, children, outboundOnly, callerId }: { me: Me; children: ReactNode } & Mode) {
  return (
    <DialerProvider>
      <Shell me={me} mode={{ outboundOnly, callerId }}>{children}</Shell>
      <CallPanel isAdmin={me.role === "admin"} />
    </DialerProvider>
  );
}

function useSummary() {
  const [s, setS] = useState<Summary | null>(null);
  const pathname = usePathname();
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/presence")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => alive && d && setS(d))
        .catch(() => {});
    load();
    const t = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [pathname]);
  return s;
}

function Shell({ me, mode, children }: { me: Me; mode: Mode; children: ReactNode }) {
  const pathname = usePathname();
  const summary = useSummary();
  // The mobile menu is open only for the page it was opened on, so navigating closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = (v: boolean) => setOpenOn(v ? pathname : null);

  const nav = [
    { href: "/", label: "Today", icon: HomeIcon, count: summary?.dueFollowUps },
    { href: "/dialer", label: "Dialer", icon: KeypadIcon },
    { href: "/contacts", label: "Contacts", icon: BuildingIcon },
    { href: "/calls", label: "Calls", icon: HistoryIcon, count: summary?.unhandled, alert: true },
    { href: "/analytics", label: "Analytics", icon: ChartIcon },
  ];
  const admin = [
    { href: "/spend", label: "Spend", icon: WalletIcon },
    { href: "/settings/numbers", label: "Numbers", icon: PhoneIcon },
    { href: "/settings/team", label: "Team", icon: UsersIcon },
  ];
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-5 pt-5 pb-6">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-black text-coral">
          <PhoneIcon size={16} />
        </span>
        <div className="leading-tight">
          <p className="font-display text-[15px] font-semibold">Outreach</p>
          <p className="text-xs text-ash">Assosiatix</p>
        </div>
      </div>

      <AvailabilityCard mode={mode} />

      <nav className="mt-5 flex-1 space-y-0.5 px-3" aria-label="Main">
        {nav.map((n) => (
          <NavLink key={n.href} {...n} active={isActive(n.href)} />
        ))}
        {me.role === "admin" && (
          <>
            <p className="px-3 pt-5 pb-1.5 text-xs font-medium text-ash">Admin</p>
            {admin.map((n) => (
              <NavLink key={n.href} {...n} active={isActive(n.href)} />
            ))}
          </>
        )}
      </nav>

      {summary && summary.team.length > 1 && (
        <div className="mx-3 mb-3 rounded-xl border border-line px-3 py-2.5">
          <p className="mb-1.5 text-xs font-medium text-ash">Team</p>
          <ul className="space-y-1">
            {summary.team.map((t) => (
              <li key={t.id} className="flex items-center justify-between text-[13px]">
                <span className="truncate">{t.id === me.id ? `${t.name} (you)` : t.name}</span>
                <span className={cx("text-xs", t.status === "online" ? "text-[oklch(0.42_0.11_158)]" : t.status === "on_call" ? "text-coral-ink" : "text-ash")}>
                  {t.status === "on_call" ? "On a call" : t.status === "online" ? "Available" : t.status === "away" ? "Away" : "Offline"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-between border-t border-line px-5 py-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{me.name}</p>
          <p className="truncate text-xs text-ash">{me.email}</p>
        </div>
        <form action={logout}>
          <button className="rounded-lg p-2 text-ash hover:bg-black/5 hover:text-black" aria-label="Sign out" title="Sign out">
            <LogoutIcon size={17} />
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-line bg-white lg:block">{sidebar}</aside>

      {/* mobile top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-white px-4 py-3 lg:hidden">
        <p className="font-display font-semibold">Outreach</p>
        <button onClick={() => setOpen(true)} className="rounded-lg border border-line-strong px-3 py-1.5 text-sm">
          Menu
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-white shadow-pop">
            <button onClick={() => setOpen(false)} className="absolute top-4 right-4 text-ash" aria-label="Close menu">
              <XIcon />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <main className="mx-auto max-w-6xl px-4 py-8 pb-40 sm:px-8">{children}</main>
    </div>
  );
}

function NavLink({
  href,
  label,
  icon: Icon,
  active,
  count,
  alert,
}: {
  href: string;
  label: string;
  icon: typeof HomeIcon;
  active: boolean;
  count?: number;
  alert?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cx(
        "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition",
        active ? "bg-black text-white" : "text-graphite hover:bg-black/5 hover:text-black",
      )}
    >
      <Icon size={17} />
      <span className="flex-1">{label}</span>
      {count ? (
        <span
          className={cx(
            "min-w-5 rounded-full px-1.5 text-center text-xs font-semibold leading-5",
            alert ? "bg-coral text-black" : active ? "bg-white/20 text-white" : "bg-black/[0.07] text-black",
          )}
        >
          {count}
        </span>
      ) : null}
    </Link>
  );
}

function AvailabilityCard({ mode }: { mode: Mode }) {
  const { deviceState, deviceError, availability, setAvailability, active, retryDevice } = useDialer();

  if (deviceState !== "ready") {
    return (
      <div className="mx-3 rounded-xl border border-line px-3 py-3">
        <p className="text-sm font-medium">
          {deviceState === "loading" ? "Connecting dialer…" : deviceState === "unconfigured" ? "Twilio not set up" : "Dialer offline"}
        </p>
        {deviceError && <p className="mt-1 text-xs leading-relaxed text-ash">{deviceError}</p>}
        {deviceState !== "loading" && (
          <button onClick={retryDevice} className="mt-2 text-xs font-medium underline underline-offset-2">
            Retry
          </button>
        )}
      </div>
    );
  }

  if (mode.outboundOnly) {
    return (
      <div className="mx-3 rounded-xl border border-line px-3 py-3">
        <p className="flex items-center gap-2 text-sm font-medium">
          <span className="h-1.5 w-1.5 rounded-full bg-positive" aria-hidden /> {active ? "On a call" : "Ready to call"}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-ash">
          Outbound only. Inbound calls are off until a Twilio number is added.
          {mode.callerId && <> Callbacks to {mode.callerId} ring where that number lives (your Numero app), not here.</>}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-3 rounded-xl border border-line p-1" role="radiogroup" aria-label="Availability">
      <div className="grid grid-cols-2 gap-1">
        {(["online", "away"] as const).map((a) => (
          <button
            key={a}
            role="radio"
            aria-checked={availability === a}
            onClick={() => setAvailability(a)}
            className={cx(
              "rounded-lg py-1.5 text-[13px] font-medium transition",
              availability === a ? (a === "online" ? "bg-positive text-white" : "bg-black text-white") : "text-graphite hover:bg-black/5",
            )}
          >
            {a === "online" ? "Available" : "Away"}
          </button>
        ))}
      </div>
      <p className="px-2 pt-1.5 pb-1 text-xs text-ash">
        {active ? "On a call — inbound goes to your teammate" : availability === "online" ? "Inbound calls ring here" : "Inbound calls won't ring you"}
      </p>
    </div>
  );
}
