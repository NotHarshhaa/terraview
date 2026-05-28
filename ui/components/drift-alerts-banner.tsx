"use client";

import { IconAlertTriangle } from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { DriftAlert } from "@/lib/types";

interface DriftAlertsBannerProps {
  alerts?: DriftAlert[];
  checkedAt?: string;
}

function formatCheckedAt(iso?: string): string | null {
  if (!iso || iso.startsWith("0001-01-01")) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function DriftAlertsBanner({ alerts, checkedAt }: DriftAlertsBannerProps) {
  if (!alerts?.length) return null;

  const when = formatCheckedAt(checkedAt);

  return (
    <Card className="gap-0 border-fuchsia-500/30 bg-fuchsia-500/5 py-0 shadow-sm">
      <CardContent className="space-y-2 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <IconAlertTriangle className="size-4 text-fuchsia-600 dark:text-fuchsia-400" aria-hidden />
          <span className="text-sm font-medium">
            {alerts.length} resource{alerts.length === 1 ? "" : "s"} drifted from provider state
          </span>
          {when ? (
            <Badge variant="outline" className="normal-case">
              checked {when}
            </Badge>
          ) : null}
        </div>
        <ul className="space-y-1 text-xs text-muted-foreground">
          {alerts.slice(0, 6).map((a) => (
            <li key={a.address} className="font-mono">
              {a.address}
              {a.attributes?.length ? (
                <span className="text-foreground/70">
                  {" "}
                  · {a.attributes.slice(0, 4).join(", ")}
                </span>
              ) : null}
            </li>
          ))}
          {alerts.length > 6 ? (
            <li className="text-muted-foreground">+{alerts.length - 6} more</li>
          ) : null}
        </ul>
      </CardContent>
    </Card>
  );
}
