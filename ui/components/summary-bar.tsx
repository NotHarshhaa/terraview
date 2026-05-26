/**
 * SummaryBar — status totals with preset button chips.
 */

"use client";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
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
      <p className="border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
        No managed resources yet. Run <code className="font-mono">terraform apply</code> and
        refresh.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
        {summary.total} {summary.total === 1 ? "resource" : "resources"}
      </span>
      <Separator orientation="vertical" className="h-4" />
      {items.map(({ status, count }) => {
        const meta = STATUS_META[status];
        const active = activeStatuses.has(status);
        return (
          <Button
            key={status}
            type="button"
            variant={active ? "secondary" : "outline"}
            size="xs"
            onClick={() => onStatusToggle(status)}
            aria-pressed={active}
            aria-label={`Filter by ${meta.label}, ${count} resources`}
            title={meta.description}
          >
            <span className="tabular-nums">{count}</span>
            {meta.label}
          </Button>
        );
      })}
      {summary.total_monthly_cost ? (
        <>
          <Separator orientation="vertical" className="h-4" />
          <span className="text-xs text-muted-foreground">
            ~${summary.total_monthly_cost.toFixed(2)}/mo
          </span>
        </>
      ) : null}
    </div>
  );
}
