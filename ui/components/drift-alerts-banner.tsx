"use client";

import { IconAlertTriangle } from "@tabler/icons-react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
    <Alert variant="destructive">
      <IconAlertTriangle />
      <AlertTitle className="flex flex-wrap items-center gap-2">
        {alerts.length} resource{alerts.length === 1 ? "" : "s"} drifted from provider state
        {when ? (
          <Badge variant="outline" className="normal-case">
            checked {when}
          </Badge>
        ) : null}
      </AlertTitle>
      <AlertDescription>
        <ul className="space-y-1 text-xs">
          {alerts.slice(0, 6).map((a) => (
            <li key={a.address} className="font-mono">
              {a.address}
              {a.attributes?.length ? (
                <span className="opacity-70">
                  {" "}
                  · {a.attributes.slice(0, 4).join(", ")}
                </span>
              ) : null}
            </li>
          ))}
          {alerts.length > 6 ? (
            <li className="opacity-70">+{alerts.length - 6} more</li>
          ) : null}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
