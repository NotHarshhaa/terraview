/**
 * SummaryBar — the row of status totals at the top of the dashboard.
 *
 * Renders only statuses that have at least one resource so the bar doesn't
 * look noisy in a freshly-applied project (where everything is "created").
 * Clicking a chip narrows the resource grid to that status — the filter
 * state is owned higher up and passed in as `onStatusToggle`.
 */

"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { STATUS_META, STATUS_ORDER, type Status, type Summary } from "@/lib/types";

interface SummaryBarProps {
  summary: Summary;
  activeStatuses: Set<Status>;
  onStatusToggle: (status: Status) => void;
}

export function SummaryBar({
  summary,
  activeStatuses,
  onStatusToggle,
}: SummaryBarProps) {
  const items = STATUS_ORDER.map((status) => ({
    status,
    count: summary.by_status[status] ?? 0,
  })).filter((i) => i.count > 0);

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-card/40 p-6 text-center text-sm text-muted-foreground">
        No managed resources yet. Run <code>terraform apply</code> and refresh.
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">
        {summary.total} {summary.total === 1 ? "resource" : "resources"}
      </span>
      <div className="h-4 w-px bg-border" aria-hidden />
      {items.map(({ status, count }) => {
        const meta = STATUS_META[status];
        const active = activeStatuses.has(status);
        return (
          <button
            key={status}
            type="button"
            onClick={() => onStatusToggle(status)}
            className={cn(
              "group inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs ring-1 ring-inset transition",
              meta.pill,
              active
                ? "shadow-sm ring-2"
                : "opacity-80 hover:opacity-100 hover:shadow-sm"
            )}
            aria-pressed={active}
            title={meta.description}
          >
            <span className={cn("size-1.5 rounded-full", meta.dot)} aria-hidden />
            <span className="font-medium">{count}</span>
            <span>{meta.label}</span>
          </button>
        );
      })}
      {summary.total_monthly_cost ? (
        <>
          <div className="h-4 w-px bg-border" aria-hidden />
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
            ~${summary.total_monthly_cost.toFixed(2)}/mo
          </span>
        </>
      ) : null}
    </div>
  );
}
