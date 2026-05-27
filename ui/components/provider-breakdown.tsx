"use client";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CloudServiceIcon } from "@/lib/cloud-icons";
import type { Summary } from "@/lib/types";

interface ProviderBreakdownProps {
  summary: Summary;
  activeProviders: Set<string>;
  onProviderToggle: (provider: string) => void;
  onClearProviders?: () => void;
}

export function ProviderBreakdown({
  summary,
  activeProviders,
  onProviderToggle,
  onClearProviders,
}: ProviderBreakdownProps) {
  const entries = Object.entries(summary.by_provider ?? {}).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );

  if (entries.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">By provider</p>
        {activeProviders.size > 0 ? (
          <Button variant="link" size="xs" onClick={onClearProviders}>
            Clear
          </Button>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {entries.map(([provider, count]) => {
          const active = activeProviders.has(provider);
          return (
            <Button
              key={provider}
              type="button"
              variant={active ? "secondary" : "outline"}
              size="xs"
              onClick={() => onProviderToggle(provider)}
              aria-pressed={active}
              aria-label={`Filter by ${provider}, ${count} resources`}
            >
              <CloudServiceIcon provider={provider} className="size-3.5" />
              <span className="tabular-nums">{count}</span>
              {provider}
            </Button>
          );
        })}
      </div>
      <Separator />
    </div>
  );
}
