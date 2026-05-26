/**
 * ResourceGrid — grouped resource table with collapsible sections.
 */

"use client";

import * as React from "react";

import {
  IconBrandAws,
  IconBrandGoogle,
  IconBrandAzure,
  IconShip,
  IconCloud,
  IconFolderOpen,
  IconChevronRight,
} from "@tabler/icons-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { type GroupByMode } from "@/lib/filters";
import { type Resource } from "@/lib/types";
import type { Density } from "@/lib/views";
import { ResourceRow } from "./resource-row";

interface ResourceGridProps {
  resources: Resource[];
  totalBeforeFilter: number;
  showCostColumn?: boolean;
  groupBy?: GroupByMode;
  density?: Density;
  onViewDetails?: (resource: Resource) => void;
  gridSignal?: { action: "expand" | "collapse"; seq: number } | null;
}

interface CategoryGroup {
  kind: "category";
  key: string;
  provider: string;
  service: string;
  resources: Resource[];
}

interface ModuleGroup {
  kind: "module";
  key: string;
  module: string;
  resources: Resource[];
}

type Group = CategoryGroup | ModuleGroup;

export function ResourceGrid({
  resources,
  totalBeforeFilter,
  showCostColumn = false,
  groupBy = "category",
  density = "comfortable",
  onViewDetails,
  gridSignal,
}: ResourceGridProps) {
  const groups = React.useMemo(
    () => (groupBy === "module" ? groupByModule(resources) : groupByCategory(resources)),
    [resources, groupBy],
  );

  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    if (!gridSignal) return;
    if (gridSignal.action === "expand") {
      setCollapsed(new Set());
    } else {
      setCollapsed(new Set(groups.map((g) => g.key)));
    }
  }, [gridSignal, groups]);

  const toggleGroup = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (resources.length === 0) {
    return (
      <Card className="border-dashed bg-card/40">
        <CardContent className="flex flex-col items-center justify-center gap-1 py-12 text-center">
          <p className="font-medium">No resources match the current filters.</p>
          <p className="text-sm text-muted-foreground">
            {totalBeforeFilter > 0
              ? `Try clearing filters to see all ${totalBeforeFilter} resources.`
              : "Run `terraform apply` and refresh once your state file is populated."}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => {
        const isCollapsed = collapsed.has(group.key);
        return (
          <Card key={group.key} className="overflow-hidden py-0">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2 text-left hover:bg-muted/50"
              onClick={() => toggleGroup(group.key)}
              aria-expanded={!isCollapsed}
            >
              <div className="flex items-center gap-2 text-sm font-medium">
                <IconChevronRight
                  className={cn(
                    "size-4 text-muted-foreground transition-transform",
                    !isCollapsed && "rotate-90",
                  )}
                  aria-hidden
                />
                {group.kind === "module" ? (
                  <>
                    <IconFolderOpen className="size-4 text-muted-foreground" aria-hidden />
                    <span className="font-mono text-xs">{group.module}</span>
                  </>
                ) : (
                  <>
                    <ProviderIcon provider={group.provider} />
                    <span>{group.provider}</span>
                    <span className="text-muted-foreground">›</span>
                    <span>{group.service}</span>
                  </>
                )}
              </div>
              <span className="font-mono text-xs text-muted-foreground tabular-nums">
                {group.resources.length}
              </span>
            </button>
            {!isCollapsed ? (
              <div className="divide-y">
                {group.resources.map((r) => (
                  <ResourceRow
                    key={r.address}
                    resource={r}
                    showCostColumn={showCostColumn}
                    density={density}
                    onViewDetails={onViewDetails}
                  />
                ))}
              </div>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}

function ProviderIcon({ provider }: { provider: string }) {
  const className = "size-4 text-muted-foreground";
  switch (provider.toLowerCase()) {
    case "aws":
      return <IconBrandAws className={className} aria-hidden />;
    case "gcp":
      return <IconBrandGoogle className={className} aria-hidden />;
    case "azure":
      return <IconBrandAzure className={className} aria-hidden />;
    case "kubernetes":
      return <IconShip className={className} aria-hidden />;
    default:
      return <IconCloud className={className} aria-hidden />;
  }
}

function groupByCategory(resources: Resource[]): CategoryGroup[] {
  const map = new Map<string, CategoryGroup>();
  for (const r of resources) {
    const key = `${r.category.provider}|${r.category.service}`;
    let g = map.get(key);
    if (!g) {
      g = {
        kind: "category",
        key,
        provider: r.category.provider,
        service: r.category.service,
        resources: [],
      };
      map.set(key, g);
    }
    g.resources.push(r);
  }
  return Array.from(map.values()).sort((a, b) => {
    if (a.provider !== b.provider) return a.provider.localeCompare(b.provider);
    return a.service.localeCompare(b.service);
  });
}

function groupByModule(resources: Resource[]): ModuleGroup[] {
  const map = new Map<string, ModuleGroup>();
  for (const r of resources) {
    const mod = r.module || "(root)";
    const key = mod;
    let g = map.get(key);
    if (!g) {
      g = { kind: "module", key, module: mod, resources: [] };
      map.set(key, g);
    }
    g.resources.push(r);
  }
  return Array.from(map.values()).sort((a, b) => a.module.localeCompare(b.module));
}
