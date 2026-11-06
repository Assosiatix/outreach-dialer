import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "call" | "danger";
const variants: Record<Variant, string> = {
  primary: "bg-black text-white hover:bg-graphite",
  secondary: "bg-white text-black border border-line-strong hover:border-black",
  ghost: "text-graphite hover:bg-black/5 hover:text-black",
  call: "bg-positive text-white hover:brightness-95",
  danger: "bg-coral text-black hover:brightness-95",
};
const sizes = { sm: "h-8 px-3 text-[13px] gap-1.5", md: "h-10 px-4 text-sm gap-2", lg: "h-12 px-5 text-[15px] gap-2" };

export function buttonClass(variant: Variant = "primary", size: keyof typeof sizes = "md") {
  return cx(
    "inline-flex items-center justify-center rounded-full font-medium transition disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap",
    variants[variant],
    sizes[size],
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: keyof typeof sizes }) {
  return <button {...props} className={cx(buttonClass(variant, size), className)} />;
}

export function LinkButton({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: keyof typeof sizes }) {
  return <Link {...props} className={cx(buttonClass(variant, size), className)} />;
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div {...props} className={cx("rounded-2xl border border-line bg-white shadow-card", className)} />;
}

export function CardHeader({ title, action, sub }: { title: ReactNode; action?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
      <div>
        <h2 className="font-display text-[15px] font-semibold">{title}</h2>
        {sub && <p className="mt-0.5 text-[13px] text-ash">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

type Tone = "neutral" | "positive" | "coral" | "dark" | "outline";
const tones: Record<Tone, string> = {
  neutral: "bg-black/[0.05] text-graphite",
  positive: "bg-positive-soft text-[oklch(0.42_0.11_158)]",
  coral: "bg-coral-soft text-coral-ink",
  dark: "bg-black text-white",
  outline: "border border-line-strong text-graphite",
};
export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", tones[tone], className)}>
      {children}
    </span>
  );
}

export function PageHeader({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
        {sub && <p className="mt-1 text-sm text-graphite">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Label({ children, htmlFor, hint }: { children: ReactNode; htmlFor?: string; hint?: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-medium text-graphite">
      {children}
      {hint && <span className="ml-1 font-normal text-ash">{hint}</span>}
    </label>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="px-6 py-12 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-sm text-sm text-ash">{children}</div>}
    </div>
  );
}
