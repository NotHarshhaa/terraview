/**
 * ResourceRow — one row in the dashboard grid.
 *
 * Shows: name + module path on the left, a tiny attribute strip in the middle
 * (instance_type, engine, region, ...), and the status badge on the right. The
 * row expands on click to show the full attribute / tag bag.
 */

"use client";

import * as React from "react";

import { IconChevronRight } from "@tabler/icons-react";

import { cn } from "@/lib/utils";
import { type Resource } from "@/lib/types";
import { StatusBadge } from "./status-badge";

interface ResourceRowProps {
  resource: Resource;
}

export function ResourceRow({ resource }: ResourceRowProps) {
  const [open, setOpen] = React.useState(false);

  const subtitle = [resource.type, resource.module || null]
    .filter(Boolean)
    .join(" · ");

  const attrSummary = React.useMemo(() => summariseAttributes(resource), [resource]);
  const hasDetails =
    !!resource.status_reason ||
    !!resource.attributes ||
    !!resource.tags ||
    !!resource.last_changed;

  return (
    <div
      className={cn(
        "group rounded-md border border-transparent",
        open ? "bg-muted/40" : "hover:bg-muted/30",
      )}
    >
      <button
        type="button"
        onClick={() => hasDetails && setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-3 py-2 text-left"
        aria-expanded={hasDetails ? open : undefined}
      >
        <IconChevronRight
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground/60 transition-transform",
            hasDetails ? "" : "opacity-0",
            open && "rotate-90",
          )}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm">
            <span className="truncate font-medium">{resource.name}</span>
            {attrSummary ? (
              <span className="hidden truncate font-mono text-xs text-muted-foreground sm:inline">
                {attrSummary}
              </span>
            ) : null}
          </div>
          <div className="truncate font-mono text-xs text-muted-foreground/80">
            {subtitle || resource.address}
          </div>
        </div>
        {resource.monthly_cost ? (
          <span className="hidden font-mono text-xs text-muted-foreground md:inline">
            ${resource.monthly_cost.toFixed(2)}/mo
          </span>
        ) : null}
        <StatusBadge status={resource.status} />
      </button>

      {open && hasDetails ? (
        <div className="space-y-3 border-t bg-background/40 px-9 py-3 text-xs">
          <div>
            <span className="font-mono text-muted-foreground/80">{resource.address}</span>
          </div>
          {resource.status_reason ? (
            <KV k="Why" v={resource.status_reason} />
          ) : null}
          {resource.attributes
            ? Object.entries(resource.attributes).map(([k, v]) => (
                <KV key={k} k={k} v={v} mono />
              ))
            : null}
          {resource.tags && Object.keys(resource.tags).length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {Object.entries(resource.tags).map(([k, v]) => (
                <span
                  key={k}
                  className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                >
                  {k}={v}
                </span>
              ))}
            </div>
          ) : null}
          {resource.last_changed && resource.last_changed !== "0001-01-01T00:00:00Z" ? (
            <KV k="Last changed" v={new Date(resource.last_changed).toLocaleString()} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function KV({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex gap-3">
      <span className="w-28 shrink-0 text-muted-foreground">{k}</span>
      <span className={cn("min-w-0 truncate", mono && "font-mono")}>{v}</span>
    </div>
  );
}

function summariseAttributes(r: Resource): string {
  if (!r.attributes) return "";
  // Pick the two most identifying attributes to show inline.
  const order = ["instance_type", "instance_class", "engine", "machine_type", "tier", "region", "cidr_block", "runtime"];
  const picks: string[] = [];
  for (const k of order) {
    const v = r.attributes[k];
    if (v && picks.length < 2) picks.push(v);
  }
  return picks.join(" · ");
}
