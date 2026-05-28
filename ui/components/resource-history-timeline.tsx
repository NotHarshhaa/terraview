"use client";

import * as React from "react";

import { IconHistory } from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchResourceHistory } from "@/lib/api";
import type { ResourceHistoryEvent } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ResourceHistoryTimelineProps {
  address: string;
}

const ACTION_META: Record<
  string,
  { label: string; className: string }
> = {
  created: {
    label: "Created",
    className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  updated: {
    label: "Updated",
    className: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  },
  destroyed: {
    label: "Destroyed",
    className: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  },
};

export function ResourceHistoryTimeline({ address }: ResourceHistoryTimelineProps) {
  const [events, setEvents] = React.useState<ResourceHistoryEvent[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchResourceHistory(address)
      .then((res) => {
        if (cancelled) return;
        setEvents(res.events ?? []);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setEvents([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [address]);

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <p className="border bg-background/60 px-3 py-2.5 text-sm text-muted-foreground">
        Could not load history: {error}
      </p>
    );
  }

  if (events.length === 0) {
    return (
      <p className="border bg-background/60 px-3 py-2.5 text-sm text-muted-foreground">
        No lifecycle events recorded yet. History builds as Terraview observes state version changes.
      </p>
    );
  }

  return (
    <ol className="relative space-y-0 border-l border-border/80 pl-4">
      {events.map((ev, i) => {
        const meta = ACTION_META[ev.action] ?? {
          label: ev.action,
          className: "bg-muted text-muted-foreground",
        };
        const when = new Date(ev.at);
        const whenLabel = Number.isNaN(when.getTime())
          ? ev.at
          : when.toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            });
        return (
          <li key={`${ev.at}-${ev.action}-${i}`} className="relative pb-4 last:pb-0">
            <span
              className="absolute top-1.5 -left-[1.125rem] size-2 rounded-full bg-border ring-2 ring-background"
              aria-hidden
            />
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={cn("normal-case", meta.className)}>
                {meta.label}
              </Badge>
              <span className="text-xs text-muted-foreground tabular-nums">{whenLabel}</span>
              {ev.serial ? (
                <span className="font-mono text-[11px] text-muted-foreground">
                  serial {ev.serial}
                </span>
              ) : null}
            </div>
            {ev.details ? (
              <p className="mt-1 text-xs text-muted-foreground">{ev.details}</p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

export function ResourceHistorySection({ address }: ResourceHistoryTimelineProps) {
  return (
    <section className="space-y-2.5">
      <h3 className="flex items-center gap-1.5 font-heading text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
        <IconHistory className="size-3.5 shrink-0" aria-hidden />
        History
      </h3>
      <ResourceHistoryTimeline address={address} />
    </section>
  );
}
