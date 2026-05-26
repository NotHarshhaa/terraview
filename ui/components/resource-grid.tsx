/**
 * ResourceGrid — the main "Provider › Service" grouped table.
 *
 * Grouping happens here (not in the API) so the UI can re-group on demand
 * (e.g. if we add a "group by module" toggle later) without a roundtrip. The
 * resource list is assumed pre-sorted by the server.
 */

"use client";

import * as React from "react";

import {
  IconBrandAws,
  IconBrandGoogle,
  IconBrandAzure,
  IconShip,
  IconCloud,
} from "@tabler/icons-react";

import { Card, CardContent } from "@/components/ui/card";
import { type Resource } from "@/lib/types";
import { ResourceRow } from "./resource-row";

interface ResourceGridProps {
  resources: Resource[];
  totalBeforeFilter: number;
  showCostColumn?: boolean;
}

interface Group {
  provider: string;
  service: string;
  resources: Resource[];
}

export function ResourceGrid({
  resources,
  totalBeforeFilter,
  showCostColumn = false,
}: ResourceGridProps) {
  const groups = React.useMemo(() => groupByCategory(resources), [resources]);

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
      {groups.map((group) => (
        <Card
          key={`${group.provider}-${group.service}`}
          className="overflow-hidden py-0"
        >
          <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ProviderIcon provider={group.provider} />
              <span>{group.provider}</span>
              <span className="text-muted-foreground">›</span>
              <span>{group.service}</span>
            </div>
            <span className="font-mono text-xs text-muted-foreground tabular-nums">
              {group.resources.length}
            </span>
          </div>
          <div className="divide-y">
            {group.resources.map((r) => (
              <ResourceRow
                key={r.address}
                resource={r}
                showCostColumn={showCostColumn}
              />
            ))}
          </div>
        </Card>
      ))}
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

function groupByCategory(resources: Resource[]): Group[] {
  const map = new Map<string, Group>();
  for (const r of resources) {
    const key = `${r.category.provider}|${r.category.service}`;
    let g = map.get(key);
    if (!g) {
      g = {
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
