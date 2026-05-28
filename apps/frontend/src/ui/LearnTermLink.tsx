import { type GlossaryTermId, getGlossaryTerm } from "@/data/glossary";
import type { ReactNode } from "react";
import { Link, type LinkProps } from "react-router-dom";
import { clsx } from "./clsx";

interface Props extends Omit<LinkProps, "to"> {
  termId: GlossaryTermId;
  children?: ReactNode;
}

export function LearnTermLink({ termId, children, className, ...props }: Props) {
  const term = getGlossaryTerm(termId);
  return (
    <Link
      to={`/learn/${termId}`}
      className={clsx("text-accent underline decoration-accent/40 underline-offset-2", className)}
      title={term ? `Learn: ${term.term}` : "Learn"}
      {...props}
    >
      {children ?? term?.term ?? termId}
    </Link>
  );
}
