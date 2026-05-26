/**
 * StatusBadge — colour-coded pill for a single resource status.
 *
 * Colours come from STATUS_META so every place in the UI that talks about a
 * status (badge, summary bar, filter chip) stays in sync. The component is
 * purely presentational and accepts the raw `Status` value to keep callers
 * untyped-by-stringification-free.
 */

import * as React from "react";

import { cn } from "@/lib/utils";
import { STATUS_META, type Status } from "@/lib/types";

interface StatusBadgeProps {
  status: Status;
  className?: string;
  withDot?: boolean;
}

export function StatusBadge({
  status,
  className,
  withDot = true,
}: StatusBadgeProps) {
  const meta = STATUS_META[status] ?? STATUS_META.unknown;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        meta.pill,
        className
      )}
      title={meta.description}
    >
      {withDot ? (
        <span className={cn("size-1.5 rounded-full", meta.dot)} aria-hidden />
      ) : null}
      {meta.label}
    </span>
  );
}
