"use client";
import { tr, trNode, useLocale } from "@/lib/ui-language";


/**
 * TermEmpty — terminal-styled empty state placeholder.
 *
 * Usage:
 *   <TermEmpty message="No agents online" hint="hire your first agent" />
 *   <TermEmpty message="Waiting for output..." />
 */
export interface TermEmptyProps {
  message: string;
  hint?: string;
  className?: string;
}

export default function TermEmpty({ message, hint, className }: TermEmptyProps) {
  useLocale();
  const cls = ["te", className].filter(Boolean).join(" ");
  return (
    <div className={cls}>
      <span className="te-msg">{tr(message)}</span>
      {hint && <span className="te-hint">{trNode(hint)}</span>}
    </div>
  );
}
