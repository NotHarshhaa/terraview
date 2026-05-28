"use client";

import {
  IconCloud,
  IconShieldCheck,
  IconAlertTriangle,
  IconStack2,
  IconGitBranch,
} from "@tabler/icons-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { CloudServiceIcon } from "@/lib/cloud-icons";
import { STATUS_META, STATUS_ORDER, type Status, type Summary } from "@/lib/types";
import { cn } from "@/lib/utils";

interface StatsBentoProps {
  summary: Summary;
  activeStatuses: Set<Status>;
  onStatusToggle: (status: Status) => void;
  activeProviders: Set<string>;
  onProviderToggle: (provider: string) => void;
  onClearProviders?: () => void;
  stateSerial?: number;
  terraformWorkspace?: string;
  backendType?: string;
}

export function StatsBento({
  summary,
  activeStatuses,
  onStatusToggle,
  activeProviders,
  onProviderToggle,
  stateSerial,
  terraformWorkspace,
  backendType,
}: StatsBentoProps) {
  const healthyCount = summary.by_status.created ?? 0;
  const healthPercent = summary.total > 0 ? Math.round((healthyCount / summary.total) * 100) : 0;

  const attentionStatuses: Status[] = [
    "drifted",
    "pending_create",
    "pending_update",
    "pending_destroy",
    "inactive",
  ];
  const attentionCount = attentionStatuses.reduce(
    (acc, s) => acc + (summary.by_status[s] ?? 0),
    0,
  );

  const providerEntries = Object.entries(summary.by_provider ?? {}).sort(
    (a, b) => b[1] - a[1],
  );
  const topProvider = providerEntries[0];

  const segments = STATUS_ORDER.map((status) => ({
    status,
    count: summary.by_status[status] ?? 0,
  })).filter((s) => s.count > 0);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {/* Total Resources - spans 1 col */}
      <Card className="relative gap-0 overflow-hidden py-0">
        <CardContent className="flex flex-col justify-between p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Total Resources
            </span>
            <IconStack2 className="size-4 text-muted-foreground" />
          </div>
          <div className="mt-3">
            <span className="text-3xl font-bold tabular-nums tracking-tight">
              {summary.total}
            </span>
            {providerEntries.length > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                across {providerEntries.length} provider
                {providerEntries.length !== 1 ? "s" : ""}
              </p>
            )}
          </div>
          {summary.total_monthly_cost ? (
            <Badge variant="secondary" className="mt-2 w-fit font-mono normal-case">
              ~${summary.total_monthly_cost.toFixed(2)}/mo
            </Badge>
          ) : null}
        </CardContent>
      </Card>

      {/* Health Score */}
      <Card className="gap-0 py-0">
        <CardContent className="flex flex-col justify-between p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Health Score
            </span>
            <IconShieldCheck className="size-4 text-emerald-500" />
          </div>
          <div className="mt-3 flex items-end gap-2">
            <span className="text-3xl font-bold tabular-nums tracking-tight">
              {healthPercent}%
            </span>
            <span className="mb-1 text-xs text-muted-foreground">
              {healthyCount} healthy
            </span>
          </div>
          <div className="mt-3">
            <DonutRing summary={summary} />
          </div>
        </CardContent>
      </Card>

      {/* Attention Needed */}
      <Card className="gap-0 py-0">
        <CardContent className="flex flex-col justify-between p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Needs Attention
            </span>
            <IconAlertTriangle
              className={cn(
                "size-4",
                attentionCount > 0
                  ? "text-destructive"
                  : "text-muted-foreground",
              )}
            />
          </div>
          <div className="mt-3">
            <span className="text-3xl font-bold tabular-nums tracking-tight">
              {attentionCount}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {attentionStatuses.map((s) => {
              const c = summary.by_status[s] ?? 0;
              if (c === 0) return null;
              const meta = STATUS_META[s];
              const active = activeStatuses.has(s);
              return (
                <Badge
                  key={s}
                  variant={active ? "default" : "outline"}
                  className={cn(
                    "cursor-pointer gap-1 normal-case tabular-nums transition-opacity",
                    activeStatuses.size > 0 && !active && "opacity-40",
                  )}
                  onClick={() => onStatusToggle(s)}
                >
                  <span className={cn("size-1.5 rounded-full", meta.dot)} />
                  {c}
                </Badge>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Top Provider */}
      <Card className="gap-0 py-0">
        <CardContent className="flex flex-col justify-between p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              {topProvider ? "Top Provider" : "Infrastructure"}
            </span>
            <IconCloud className="size-4 text-muted-foreground" />
          </div>
          {topProvider ? (
            <>
              <div className="mt-3 flex items-center gap-2">
                <CloudServiceIcon provider={topProvider[0]} className="size-6" />
                <span className="text-lg font-semibold">{topProvider[0]}</span>
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="font-mono tabular-nums">{topProvider[1]}</span>
                resources
                {providerEntries.length > 1 && (
                  <>
                    <Separator orientation="vertical" className="h-3" />
                    <span>+{providerEntries.length - 1} more</span>
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="mt-3 flex items-center gap-2">
              <IconGitBranch className="size-5 text-muted-foreground" />
              <div className="text-xs text-muted-foreground">
                {backendType && (
                  <p className="font-mono">{backendType}</p>
                )}
                {terraformWorkspace && (
                  <p>ws: {terraformWorkspace}</p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Status Distribution Bar - spans full width */}
      <Card className="gap-0 py-0 sm:col-span-2 lg:col-span-4">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Status Distribution
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {segments.length} {segments.length === 1 ? "status" : "statuses"}
            </span>
          </div>
          {segments.length > 0 ? (
            <>
              <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-muted">
                {segments.map(({ status, count }) => {
                  const width = (count / summary.total) * 100;
                  const meta = STATUS_META[status];
                  const active = activeStatuses.has(status);
                  return (
                    <button
                      key={status}
                      type="button"
                      style={{ width: `${Math.max(width, 2)}%` }}
                      className={cn(
                        "h-full min-w-0 transition-all",
                        meta.dot,
                        activeStatuses.size > 0 && !active && "opacity-20",
                        active && "opacity-100",
                        "hover:brightness-110",
                      )}
                      title={`${meta.label}: ${count} (${Math.round(width)}%)`}
                      onClick={() => onStatusToggle(status)}
                    />
                  );
                })}
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                {segments.map(({ status, count }) => {
                  const meta = STATUS_META[status];
                  const active = activeStatuses.has(status);
                  const pct = Math.round((count / summary.total) * 100);
                  return (
                    <button
                      key={status}
                      type="button"
                      onClick={() => onStatusToggle(status)}
                      className={cn(
                        "flex items-center gap-1.5 text-xs transition-opacity",
                        activeStatuses.size > 0 && !active && "opacity-40",
                      )}
                    >
                      <span
                        className={cn("size-2 rounded-full", meta.dot)}
                      />
                      <span className="text-muted-foreground">{meta.label}</span>
                      <span className="font-mono font-medium tabular-nums">
                        {count}
                      </span>
                      <span className="text-muted-foreground/60">({pct}%)</span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              No resources yet.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Provider breakdown cards - spans full width */}
      {providerEntries.length > 0 && (
        <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2 lg:col-span-4 lg:grid-cols-4">
          {providerEntries.map(([provider, count]) => {
            const pct = Math.round((count / summary.total) * 100);
            const active = activeProviders.has(provider);
            return (
              <Card
                key={provider}
                role="button"
                tabIndex={0}
                onClick={() => onProviderToggle(provider)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onProviderToggle(provider);
                  }
                }}
                className={cn(
                  "cursor-pointer gap-0 py-0 shadow-sm transition-opacity hover:bg-accent",
                  active && "ring-2 ring-primary",
                  activeProviders.size > 0 && !active && "opacity-50",
                )}
              >
                <CardContent className="flex items-center gap-3 p-3">
                  <CloudServiceIcon provider={provider} className="size-8 shrink-0" />
                  <div className="min-w-0 flex-1 text-left">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{provider}</span>
                      <Badge variant="outline" className="shrink-0 font-mono normal-case tabular-nums">
                        {pct}%
                      </Badge>
                    </div>
                    <Progress value={pct} className="mt-1.5 h-1.5" />
                    <span className="mt-1 text-xs text-muted-foreground tabular-nums">
                      {count} resource{count !== 1 ? "s" : ""}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DonutRing({ summary }: { summary: Summary }) {
  const segments = STATUS_ORDER.map((status) => ({
    status,
    count: summary.by_status[status] ?? 0,
  })).filter((s) => s.count > 0);

  if (summary.total === 0) return null;

  const statusColors: Record<Status, string> = {
    created: "#10b981",
    inactive: "#f59e0b",
    pending_create: "#0ea5e9",
    pending_update: "#8b5cf6",
    pending_destroy: "#f43f5e",
    drifted: "#d946ef",
    unmanaged: "#71717a",
    unknown: "#a1a1aa",
  };

  let cumulative = 0;
  const size = 44;
  const strokeWidth = 5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="flex items-center gap-3">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          className="stroke-muted"
          strokeWidth={strokeWidth}
        />
        {segments.map(({ status, count }) => {
          const pct = count / summary.total;
          const dashLength = pct * circumference;
          const offset = cumulative * circumference;
          cumulative += pct;
          return (
            <circle
              key={status}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={statusColors[status]}
              strokeWidth={strokeWidth}
              strokeDasharray={`${dashLength} ${circumference - dashLength}`}
              strokeDashoffset={-offset}
              strokeLinecap="round"
            />
          );
        })}
      </svg>
      <div className="flex flex-col gap-0.5">
        {segments.slice(0, 3).map(({ status, count }) => (
          <div key={status} className="flex items-center gap-1.5 text-[10px]">
            <span
              className={cn("size-1.5 rounded-full", STATUS_META[status].dot)}
            />
            <span className="text-muted-foreground">{STATUS_META[status].label}</span>
            <span className="font-mono font-medium">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
