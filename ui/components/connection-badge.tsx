"use client";

import * as React from "react";

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

interface ConnectionBadgeProps {
  state: ConnectionState;
  lastRefreshedAt?: string;
  pollInterval?: number;
}

export function ConnectionBadge({ state, lastRefreshedAt, pollInterval = 30 }: ConnectionBadgeProps) {
  const meta = META[state];
  const countdown = useCountdown(state === "polling" ? lastRefreshedAt : undefined, pollInterval);

  return (
    <Badge
      variant="outline"
      className="gap-1.5 normal-case"
      title={meta.title}
    >
      <span className={cn("size-1.5 rounded-full", meta.dot)} aria-hidden />
      {meta.label}
      {countdown !== null && (
        <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
          {countdown}s
        </span>
      )}
    </Badge>
  );
}

function useCountdown(lastRefreshedAt: string | undefined, intervalSec: number): number | null {
  const [remaining, setRemaining] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (!lastRefreshedAt) {
      setRemaining(null);
      return;
    }
    const update = () => {
      const elapsed = Math.floor((Date.now() - new Date(lastRefreshedAt).getTime()) / 1000);
      const left = Math.max(0, intervalSec - elapsed);
      setRemaining(left);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [lastRefreshedAt, intervalSec]);

  return remaining;
}
