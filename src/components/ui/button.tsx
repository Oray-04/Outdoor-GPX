import Link from "next/link";
import clsx from "clsx";
import type { ComponentProps } from "react";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold tracking-[-0.005em] transition-[background-color,border-color,box-shadow,transform,color] duration-200 ease-out active:scale-[0.98] disabled:opacity-45 disabled:pointer-events-none whitespace-nowrap";
const variants = {
  primary: "bg-gradient-to-b from-ember-400 to-ember-600 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.28),0_8px_20px_-8px_rgb(179_74_28/0.75)] hover:brightness-[1.06] hover:-translate-y-px",
  brand: "bg-gradient-to-b from-pine-500 to-pine-700 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.2),0_8px_20px_-10px_rgb(11_74_57/0.8)] hover:brightness-110 hover:-translate-y-px",
  secondary: "bg-white/90 text-ink-900 border border-ink-200 shadow-[0_1px_0_rgb(255_255_255/0.8)_inset] hover:border-brass-400 hover:bg-white",
  ghost: "text-ink-700 hover:bg-ink-900/[0.06]",
  onDark: "bg-white/10 text-white border border-white/20 hover:bg-white/20 hover:border-brass-400/70 backdrop-blur",
} as const;
const sizes = { sm: "h-10 px-3.5 text-sm lg:h-9", md: "h-11 px-5 text-[15px]", lg: "h-13 px-7 text-base" } as const;

type Props = { variant?: keyof typeof variants; size?: keyof typeof sizes; className?: string };

export function Button({ variant = "primary", size = "md", className, ...p }: Props & ComponentProps<"button">) {
  return <button className={clsx(base, variants[variant], sizes[size], className)} {...p} />;
}

export function ButtonLink({ variant = "primary", size = "md", className, ...p }: Props & ComponentProps<typeof Link>) {
  return <Link className={clsx(base, variants[variant], sizes[size], className)} {...p} />;
}
