"use client";

import {
  IconAlertTriangle,
  IconArrowRight,
} from "@tabler/icons-react";

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { STATUS_META, STATUS_ORDER, type Status, type Summary } from "@/lib/types";

const ATTENTION_STATUSES: Status[] = [
  "drifted",
  "pending_create",
  "pending_update",
  "pending_destroy",
  "inactive",
  "unmanaged",
];

interface AttentionBannerProps {
  summary: Summary;
  onFilterStatus: (statuses: Set<Status>) => void;
}

export function AttentionBanner({ summary, onFilterStatus }: AttentionBannerProps) {
  const items = ATTENTION_STATUSES.map((status) => ({
    status,
    count: summary.by_status[status] ?? 0,
  })).filter((i) => i.count > 0);

  const total = items.reduce((n, i) => n + i.count, 0);
  if (total === 0) return null;

  return (
    <Alert variant="destructive">
      <IconAlertTriangle />
      <AlertTitle>
        {total} resource{total === 1 ? "" : "s"} need attention
      </AlertTitle>
      <AlertDescription>
        <div className="flex flex-wrap gap-2 pt-1">
          {items.map(({ status, count }) => (
            <Button
              key={status}
              variant="outline"
              size="xs"
              className="gap-1.5"
              onClick={() => onFilterStatus(new Set([status]))}
            >
              <span className={cn("size-1.5 rounded-full", STATUS_META[status].dot)} />
              {count} {STATUS_META[status].label.toLowerCase()}
            </Button>
          ))}
        </div>
      </AlertDescription>
      <AlertAction>
        <Button
          variant="link"
          size="xs"
          className="gap-1"
          onClick={() => onFilterStatus(new Set(ATTENTION_STATUSES))}
        >
          Show all
          <IconArrowRight className="size-3" />
        </Button>
      </AlertAction>
    </Alert>
  );
}

interface StatusChartProps {
  summary: Summary;
  activeStatuses: Set<Status>;
  onStatusToggle: (status: Status) => void;
}

export function StatusChart({
  summary,
  activeStatuses,
  onStatusToggle,
}: StatusChartProps) {
  const segments = STATUS_ORDER.map((status) => ({
    status,
    count: summary.by_status[status] ?? 0,
  })).filter((s) => s.count > 0);

  if (segments.length === 0 || summary.total === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Status distribution</p>
      <div
        className="flex w-full overflow-hidden bg-muted"
        role="img"
        aria-label="Status distribution"
      >
        {segments.map(({ status, count }) => {
          const width = (count / summary.total) * 100;
          const active = activeStatuses.has(status);
          return (
            <button
              key={status}
              type="button"
              style={{ width: `${width}%` }}
              className={cn(
                "h-0.5 min-w-0 bg-foreground transition-opacity hover:opacity-80",
                activeStatuses.size && !active && "opacity-25",
                active && "opacity-100",
              )}
              title={`${STATUS_META[status].label}: ${count}`}
              onClick={() => onStatusToggle(status)}
              aria-label={`${STATUS_META[status].label}: ${count}`}
            />
          );
        })}
      </div>
      <Separator />
    </div>
  );
}
