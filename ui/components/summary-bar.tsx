"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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
      <Card className="border-dashed py-0 shadow-none">
        <CardContent className="flex items-center justify-center px-4 py-8">
          <p className="text-sm text-muted-foreground">
            No managed resources yet. Run <code className="font-mono">terraform apply</code> and
            refresh.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="gap-0 py-0 shadow-sm">
      <CardContent className="p-0">
        <div className="flex items-center overflow-x-auto">
          <div className="flex shrink-0 items-center gap-1.5 border-r px-4 py-3">
            <span className="text-2xl font-bold tabular-nums tracking-tight">
              {summary.total}
            </span>
            <span className="text-xs text-muted-foreground">
              total
            </span>
          </div>
          <div className="flex flex-1 flex-wrap items-center gap-1 px-3 py-2.5">
            {items.map(({ status, count }) => {
              const meta = STATUS_META[status];
              const active = activeStatuses.has(status);
              const pct =
                summary.total > 0 ? Math.round((count / summary.total) * 100) : 0;
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => onStatusToggle(status)}
                  aria-pressed={active}
                  className={cn(
                    "group/pill flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs transition-all",
                    active
                      ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                      : "border-transparent hover:border-border hover:bg-muted/50",
                    activeStatuses.size > 0 && !active && "opacity-40",
                  )}
                >
                  <span
                    className={cn("size-2 rounded-full", meta.dot)}
                  />
                  <span className="font-medium tabular-nums">{count}</span>
                  <span className="text-muted-foreground">{meta.label}</span>
                  <span className="hidden text-muted-foreground/60 tabular-nums group-hover/pill:inline">
                    {pct}%
                  </span>
                </button>
              );
            })}
          </div>
          {summary.total_monthly_cost ? (
            <div className="flex shrink-0 items-center border-l px-4 py-3">
              <div className="text-right">
                <p className="font-mono text-sm font-semibold tabular-nums">
                  ${summary.total_monthly_cost.toFixed(2)}
                </p>
                <p className="text-[10px] text-muted-foreground">est. monthly</p>
              </div>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
