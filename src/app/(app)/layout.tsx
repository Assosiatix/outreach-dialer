import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { requireMember } from "@/lib/auth";
import { inboundMode } from "@/lib/numbers";
import { formatPhone } from "@/lib/phone";
import { twilioConfigured } from "@/lib/twilio";
import { webhookHealth } from "@/lib/twilio-setup";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const me = await requireMember();
  const [mode, health] = await Promise.all([inboundMode(), twilioConfigured() ? webhookHealth() : Promise.resolve(null)]);
  return (
    <AppShell
      me={{ id: me.id, name: me.name, email: me.email, role: me.role }}
      outboundOnly={mode.outboundOnly}
      callerId={mode.callerId ? formatPhone(mode.callerId) : null}
    >
      {health && !health.ok && (
        <div role="alert" className="mb-6 rounded-2xl border border-coral-tint bg-coral-soft px-5 py-4 text-sm">
          <p className="font-medium">Calls can&apos;t reach this app right now</p>
          <p className="mt-0.5 text-graphite">
            {health.reason} Twilio sends calls to <code className="break-all">{health.actual ?? "(nothing)"}</code>, but this app is at{" "}
            <code className="break-all">{health.expected}</code>.{" "}
            {me.role === "admin" ? (
              <Link href="/settings/numbers" className="font-medium underline">
                Fix it: Numbers → Configure webhooks
              </Link>
            ) : (
              "Ask an admin to run Configure webhooks."
            )}
          </p>
        </div>
      )}
      {children}
    </AppShell>
  );
}
