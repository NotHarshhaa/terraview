/**
 * ResourceGrid — grouped resource table with collapsible sections.
 */

"use client";

import * as React from "react";

import { IconChevronRight, IconFolderOpen, IconTag } from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { CloudServiceIcon } from "@/lib/cloud-icons";
import { type GroupByMode } from "@/lib/filters";
import { type Resource } from "@/lib/types";
import type { Density } from "@/lib/views";
import { cn } from "@/lib/utils";
import { ResourceRow } from "./resource-row";

interface ResourceGridProps {
  resources: Resource[];
  totalBeforeFilter: number;
  showCostColumn?: boolean;
  groupBy?: GroupByMode;
  tagGroupKey?: string;
  density?: Density;
  onViewDetails?: (resource: Resource) => void;
  gridSignal?: { action: "expand" | "collapse"; seq: number } | null;
  focusedAddress?: string;
  bulkMode?: boolean;
  selectedAddresses?: Set<string>;
  onToggleSelect?: (address: string) => void;
  pinnedAddresses?: Set<string>;
  onTogglePin?: (address: string) => void;
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

interface TagGroup {
  kind: "tag";
  key: string;
  label: string;
  resources: Resource[];
}

type Group = CategoryGroup | ModuleGroup | TagGroup;

export function ResourceGrid({
  resources,
  totalBeforeFilter,
  showCostColumn = false,
  groupBy = "category",
  tagGroupKey = "Environment",
  density = "comfortable",
  onViewDetails,
  gridSignal,
  focusedAddress,
  bulkMode,
  selectedAddresses,
  onToggleSelect,
  pinnedAddresses,
  onTogglePin,
}: ResourceGridProps) {
  const groups = React.useMemo(() => {
    if (groupBy === "module") return groupByModule(resources);
    if (groupBy === "tag") return groupByTag(resources, tagGroupKey);
    return groupByCategory(resources);
  }, [resources, groupBy, tagGroupKey]);

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
      <Card className="border-dashed bg-card/40 py-0 shadow-none">
        <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <IconFolderOpen className="size-6 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium">No resources match</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              {totalBeforeFilter > 0
                ? `Try clearing filters to see all ${totalBeforeFilter} resources.`
                : "Run `terraform apply` and refresh once your state file is populated."}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {groups.map((group) => {
        const isCollapsed = collapsed.has(group.key);
        return (
          <Card key={group.key} className="gap-0 overflow-hidden py-0 shadow-sm">
            <CardHeader className="gap-0 border-b bg-muted/20 px-0 py-0">
              <Button
                type="button"
                variant="ghost"
                className="h-auto w-full justify-between rounded-none px-3 py-2.5 hover:bg-muted/40"
                onClick={() => toggleGroup(group.key)}
                aria-expanded={!isCollapsed}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <IconChevronRight
                    className={cn(
                      "size-4 shrink-0 text-muted-foreground transition-transform",
                      !isCollapsed && "rotate-90",
                    )}
                    aria-hidden
                  />
                  {group.kind === "module" ? (
                    <>
                      <IconFolderOpen
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-hidden
                      />
                      <span className="truncate font-mono text-xs">
                        {group.module}
                      </span>
                    </>
                  ) : group.kind === "tag" ? (
                    <>
                      <IconTag
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-hidden
                      />
                      <span className="truncate font-mono text-xs">{group.label}</span>
                    </>
                  ) : (
                    <>
                      <CloudServiceIcon
                        provider={group.provider}
                        service={group.service}
                        className="size-4 shrink-0"
                      />
                      <span className="truncate font-heading text-xs font-semibold tracking-wider uppercase">
                        {group.provider}
                      </span>
                      <span className="text-muted-foreground">›</span>
                      <span className="truncate text-xs">{group.service}</span>
                    </>
                  )}
                </span>
                <Badge variant="outline" className="ml-2 shrink-0 normal-case tabular-nums">
                  {group.resources.length}
                </Badge>
              </Button>
            </CardHeader>

            {!isCollapsed ? (
              <CardContent className="divide-y p-0">
                {group.resources.map((r) => (
                  <ResourceRow
                    key={r.address}
                    resource={r}
                    showCostColumn={showCostColumn}
                    density={density}
                    onViewDetails={onViewDetails}
                    focused={r.address === focusedAddress}
                    bulkMode={bulkMode}
                    selected={selectedAddresses?.has(r.address)}
                    onToggleSelect={onToggleSelect}
                    pinned={pinnedAddresses?.has(r.address)}
                    onTogglePin={onTogglePin}
                  />
                ))}
              </CardContent>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
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

function groupByTag(resources: Resource[], tagKey: string): TagGroup[] {
  const key = tagKey.trim() || "Environment";
  const map = new Map<string, TagGroup>();
  for (const r of resources) {
    const raw = r.tags?.[key];
    const label = raw ? `${key}=${raw}` : `(no ${key})`;
    const groupKey = raw ?? `(no ${key})`;
    let g = map.get(groupKey);
    if (!g) {
      g = { kind: "tag", key: groupKey, label, resources: [] };
      map.set(groupKey, g);
    }
    g.resources.push(r);
  }
  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
}
