import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <p className="font-display text-xl font-semibold">Not found</p>
      <p className="mt-1 text-sm text-graphite">That page or record doesn&apos;t exist (it may have been deleted).</p>
      <Link href="/" className="mt-4 text-sm font-medium underline underline-offset-2">
        Back to Today
      </Link>
    </div>
  );
}
