"use client";

import { Button, Card } from "@/components/ui";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Card className="mx-auto mt-10 max-w-md p-6 text-center">
      <p className="font-display text-lg font-semibold">Something went wrong</p>
      <p className="mt-1 text-sm text-graphite">The page failed to load. Your calls are not affected.</p>
      {error.digest && <p className="mt-2 text-xs text-ash">Ref: {error.digest}</p>}
      <Button className="mt-5" onClick={reset}>
        Try again
      </Button>
    </Card>
  );
}
