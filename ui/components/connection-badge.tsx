"use client";

import { Badge } from "@/components/ui/badge";
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
    <Badge
      variant="outline"
      className="gap-1.5 normal-case"
      title={meta.title}
    >
      <span className={cn("size-1.5 rounded-full", meta.dot)} aria-hidden />
      {meta.label}
    </Badge>
  );
}
