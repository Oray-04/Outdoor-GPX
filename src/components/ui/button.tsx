import Link from "next/link";
import clsx from "clsx";
import type { ComponentProps } from "react";

const base =
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition duration-200 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap";
const variants = {
  primary: "bg-ember-500 text-white hover:bg-ember-600 shadow-[0_6px_16px_-6px_rgb(240_97_43/0.7)]",
  brand: "bg-pine-600 text-white hover:bg-pine-700",
  secondary: "bg-white text-ink-900 border border-ink-200 hover:border-ink-300 hover:bg-ink-50",
  ghost: "text-ink-700 hover:bg-ink-100",
  onDark: "bg-white/10 text-white border border-white/20 hover:bg-white/20 backdrop-blur",
} as const;
const sizes = { sm: "h-9 px-3.5 text-sm", md: "h-11 px-5 text-[15px]", lg: "h-13 px-7 text-base" } as const;

type Props = { variant?: keyof typeof variants; size?: keyof typeof sizes; className?: string };

export function Button({ variant = "primary", size = "md", className, ...p }: Props & ComponentProps<"button">) {
  return <button className={clsx(base, variants[variant], sizes[size], className)} {...p} />;
}

export function ButtonLink({ variant = "primary", size = "md", className, ...p }: Props & ComponentProps<typeof Link>) {
  return <Link className={clsx(base, variants[variant], sizes[size], className)} {...p} />;
}
