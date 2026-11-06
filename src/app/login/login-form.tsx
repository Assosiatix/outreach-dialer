"use client";

import { useActionState } from "react";
import { Button, Card, Label } from "@/components/ui";
import { login } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <Card className="p-6">
      <form action={action} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <div>
          <Label htmlFor="email">Email</Label>
          <input id="email" name="email" type="email" autoComplete="email" required className="field" />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <input id="password" name="password" type="password" autoComplete="current-password" required className="field" />
        </div>
        {state?.error && (
          <p role="alert" className="text-sm text-coral-ink">
            {state.error}
          </p>
        )}
        <Button className="w-full" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </Card>
  );
}
