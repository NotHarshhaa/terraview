"use client";

import { cn } from "@/lib/utils";
import type { ConnectionState } from "@/lib/api";

const META: Record<
  ConnectionState,
  { label: string; dot: string; title: string }
> = {
  connecting: {
    label: "Connecting",
    dot: "bg-sky-500 animate-pulse",
    title: "Opening live update stream…",
  },
  live: {
    label: "Live",
    dot: "bg-emerald-500",
    title: "Receiving server-sent refresh events",
  },
  polling: {
    label: "Polling",
    dot: "bg-amber-500",
    title: "Live stream unavailable — polling every 30s",
  },
  offline: {
    label: "Offline",
    dot: "bg-rose-500",
    title: "Cannot reach the Terraview API",
  },
};

export function ConnectionBadge({ state }: { state: ConnectionState }) {
  const meta = META[state];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
      title={meta.title}
    >
      <span className={cn("size-1.5 rounded-full", meta.dot)} aria-hidden />
      {meta.label}
    </span>
  );
}
