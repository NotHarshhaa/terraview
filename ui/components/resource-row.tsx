/**
 * ResourceRow — one row in the dashboard grid.
 */

"use client";

import * as React from "react";

import { IconChevronRight, IconInfoCircle } from "@tabler/icons-react";

import { CopyButton, CopyText } from "@/components/copy-button";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CloudResourceIcon } from "@/lib/cloud-icons";
import { resourceDomId } from "@/lib/filters";
import { type Resource, PLAN_ACTION_META, STATUS_META } from "@/lib/types";
import type { Density } from "@/lib/views";
import { cn } from "@/lib/utils";

interface ResourceRowProps {
  resource: Resource;
  showCostColumn?: boolean;
  density?: Density;
  onViewDetails?: (resource: Resource) => void;
  focused?: boolean;
}

export function ResourceRow({
  resource,
  showCostColumn = false,
  density = "comfortable",
  onViewDetails,
  focused = false,
}: ResourceRowProps) {
  const [open, setOpen] = React.useState(false);

  const subtitle = [resource.type, resource.module || null]
    .filter(Boolean)
    .join(" · ");

  const attrSummary = React.useMemo(() => summariseAttributes(resource), [resource]);
  const hasLastChanged =
    !!resource.last_changed &&
    !resource.last_changed.startsWith("0001-01-01");
  const hasDetails =
    !!resource.status_reason ||
    !!resource.plan_action ||
    !!(resource.drift_attributes && resource.drift_attributes.length) ||
    !!resource.attributes ||
    (resource.tags && Object.keys(resource.tags).length > 0) ||
    hasLastChanged;

  const rowPadding = density === "compact" ? "py-1.5" : "py-2.5";

  const statusMeta = STATUS_META[resource.status];

  const mainContent = (
    <>
      <IconChevronRight
        className={cn(
          "size-3.5 shrink-0 text-muted-foreground transition-transform",
          hasDetails ? "" : "opacity-0",
          open && "rotate-90",
        )}
        aria-hidden
      />
      <div className="relative">
        <CloudResourceIcon
          provider={resource.category.provider}
          service={resource.category.service}
          resourceType={resource.type}
          className="size-5 shrink-0"
        />
        <span
          className={cn(
            "absolute -right-0.5 -bottom-0.5 size-2 rounded-full ring-2 ring-background",
            statusMeta.dot,
          )}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="truncate text-sm font-medium">{resource.name}</span>
          {resource.plan_action ? (
            <Badge variant="outline" className="hidden normal-case sm:inline-flex">
              {PLAN_ACTION_META[resource.plan_action]?.label ?? resource.plan_action}
            </Badge>
          ) : null}
          {attrSummary ? (
            <span className="hidden truncate font-mono text-[11px] text-muted-foreground md:inline">
              {attrSummary}
            </span>
          ) : null}
        </div>
        <p className="truncate font-mono text-[11px] text-muted-foreground">
          {subtitle || resource.address}
        </p>
      </div>
      {showCostColumn && resource.monthly_cost ? (
        <Badge variant="ghost" className="hidden shrink-0 font-mono normal-case md:inline-flex">
          ${resource.monthly_cost.toFixed(2)}/mo
        </Badge>
      ) : null}
    </>
  );

  return (
    <div
      id={resourceDomId(resource.address)}
      className={cn(
        "group scroll-mt-24 bg-background transition-colors",
        open && "bg-muted/20",
        focused && "ring-2 ring-inset ring-primary/40",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2 px-3",
          rowPadding,
          !open && "hover:bg-muted/30",
        )}
      >
        {hasDetails ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            onDoubleClick={() => onViewDetails?.(resource)}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
            aria-expanded={open}
          >
            {mainContent}
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-2">{mainContent}</div>
        )}

        <div className="flex shrink-0 items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <CopyButton
                value={resource.address}
                label="Copy address"
                className="opacity-0 group-hover:opacity-100"
              />
            </TooltipTrigger>
            <TooltipContent>Copy address</TooltipContent>
          </Tooltip>
          {onViewDetails ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="opacity-0 group-hover:opacity-100"
                  onClick={() => onViewDetails(resource)}
                  aria-label="View details"
                >
                  <IconInfoCircle className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>View details</TooltipContent>
            </Tooltip>
          ) : null}
          <StatusBadge status={resource.status} className="shrink-0" />
        </div>
      </div>

      {open && hasDetails ? (
        <>
          <Separator />
          <div className="space-y-3 bg-muted/10 px-3 py-3 pl-10 text-xs">
            <CopyText
              value={resource.address}
              mono
              className="text-muted-foreground"
            />

            {resource.status_reason ? (
              <DetailBlock label="Status reason">{resource.status_reason}</DetailBlock>
            ) : null}

            {resource.drift_attributes && resource.drift_attributes.length > 0 ? (
              <DetailBlock label="Drift">
                <div className="flex flex-wrap gap-1">
                  {resource.drift_attributes.map((attr) => (
                    <Badge
                      key={attr}
                      variant="outline"
                      className="font-mono normal-case"
                    >
                      {attr}
                    </Badge>
                  ))}
                </div>
              </DetailBlock>
            ) : null}

            {resource.attributes && Object.keys(resource.attributes).length > 0 ? (
              <DetailBlock label="Attributes">
                <dl className="space-y-1">
                  {Object.entries(resource.attributes).map(([k, v]) => (
                    <div key={k} className="grid grid-cols-[6.5rem_1fr] gap-2">
                      <dt className="text-muted-foreground">{k}</dt>
                      <dd className="truncate font-mono">{v}</dd>
                    </div>
                  ))}
                </dl>
              </DetailBlock>
            ) : null}

            {resource.tags && Object.keys(resource.tags).length > 0 ? (
              <DetailBlock label="Tags">
                <div className="flex flex-wrap gap-1">
                  {Object.entries(resource.tags).map(([k, v]) => (
                    <Badge
                      key={k}
                      variant="secondary"
                      className="font-mono normal-case"
                    >
                      {k}={v}
                    </Badge>
                  ))}
                </div>
              </DetailBlock>
            ) : null}

            {resource.last_changed && hasLastChanged ? (
              <DetailBlock label="Last changed">
                {new Date(resource.last_changed).toLocaleString()}
              </DetailBlock>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

function DetailBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
        {label}
      </p>
      {children}
    </div>
  );
}

function summariseAttributes(r: Resource): string {
  if (!r.attributes) return "";
  const order = [
    "instance_type",
    "instance_class",
    "engine",
    "machine_type",
    "tier",
    "region",
    "cidr_block",
    "runtime",
  ];
  const picks: string[] = [];
  for (const k of order) {
    const v = r.attributes[k];
    if (v && picks.length < 2) picks.push(v);
  }
  return picks.join(" · ");
}
