import type { ButtonHTMLAttributes, ReactNode } from "react";
import { clsx } from "./clsx";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

const base =
  "inline-flex items-center justify-center rounded-md font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 disabled:cursor-not-allowed";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-surface hover:bg-accent/90",
  secondary: "bg-panel text-ink hover:bg-panel/80 border border-white/10",
  ghost: "text-ink hover:bg-panel/60",
  danger: "bg-bad text-white hover:bg-bad/90",
};

const sizes: Record<Size, string> = {
  sm: "text-sm px-3 py-1.5",
  md: "text-sm px-4 py-2",
  lg: "text-base px-5 py-3",
};

export function Button({ variant = "primary", size = "md", className, ...rest }: Props) {
  return <button className={clsx(base, variants[variant], sizes[size], className)} {...rest} />;
}
